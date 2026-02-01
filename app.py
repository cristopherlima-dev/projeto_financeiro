import os
import time
import threading
import telebot 
import pyotp
import qrcode
from io import BytesIO
import base64
from telebot import types
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory, flash, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func
from dotenv import load_dotenv
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user

load_dotenv()

app = Flask(__name__)

# --- CONFIGURAÇÃO DE CAMINHOS ABSOLUTOS (CORREÇÃO DO ERRO) ---
basedir = os.path.abspath(os.path.dirname(__file__)) # Pega a pasta atual (/app)
db_path = os.path.join(basedir, 'dados', 'financeiro.db') # Monta /app/dados/financeiro.db

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key') 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'uploads')

# Garante que as pastas existem
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

dados_dir = os.path.join(basedir, 'dados')
if not os.path.exists(dados_dir):
    os.makedirs(dados_dir)

# --- LOGIN ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = "Por favor, faça login para acessar."

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
bot = telebot.TeleBot(TELEGRAM_TOKEN) if TELEGRAM_TOKEN else None

db = SQLAlchemy(app)

# --- MODELOS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(100), nullable=True) 
    is_admin = db.Column(db.Boolean, default=False)
    # NOVA COLUNA: Guarda a chave secreta do 2FA
    totp_secret = db.Column(db.String(32), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # NOVOS MÉTODOS PARA 2FA
    def get_totp_uri(self):
        return pyotp.totp.TOTP(self.totp_secret).provisioning_uri(
            name=self.username, 
            issuer_name='Financas do Cris'
        )

    def verify_totp(self, token):
        return pyotp.totp.TOTP(self.totp_secret).verify(token)

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

class Tipo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    def to_dict(self): return {"id": self.id, "nome": self.nome}

class Subtipo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    tipo_id = db.Column(db.Integer, db.ForeignKey('tipo.id'), nullable=False)
    def to_dict(self): return {"id": self.id, "nome": self.nome, "tipo_id": self.tipo_id}

class Categoria(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    subtipo_id = db.Column(db.Integer, db.ForeignKey('subtipo.id'), nullable=False)
    def to_dict(self): return {"id": self.id, "nome": self.nome, "subtipo_id": self.subtipo_id}

class Lancamento(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.String(10), nullable=False)
    descricao = db.Column(db.String(100), nullable=False)
    tipo_id = db.Column(db.Integer, db.ForeignKey('tipo.id'), nullable=False)
    subtipo_id = db.Column(db.Integer, db.ForeignKey('subtipo.id'), nullable=False)
    categoria_id = db.Column(db.Integer, db.ForeignKey('categoria.id'), nullable=True)
    valor = db.Column(db.Float, nullable=False)
    efetivado = db.Column(db.Boolean, default=False)
    comprovante = db.Column(db.String(200), nullable=True)

    def to_dict(self):
        t = db.session.get(Tipo, self.tipo_id)
        s = db.session.get(Subtipo, self.subtipo_id)
        c = db.session.get(Categoria, self.categoria_id)
        return {
            "id": self.id, "data": self.data, "descricao": self.descricao,
            "tipo": t.nome if t else "N/A", "subtipo": s.nome if s else "N/A",
            "categoria": c.nome if c else "-", "valor": self.valor,
            "efetivado": self.efetivado, "comprovante": self.comprovante
        }

class Vencimento(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    descricao = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)
    dia = db.Column(db.Integer, nullable=True)
    data_vencimento = db.Column(db.String(10), nullable=True)
    ativo = db.Column(db.Boolean, default=False) 
    def to_dict(self):
        return {"id": self.id, "descricao": self.descricao, "tipo": self.tipo, "dia": self.dia, "data_vencimento": self.data_vencimento, "ativo": self.ativo}

def inicializar_banco():
    with app.app_context():
        db.create_all()
        if not db.session.get(Tipo, 1):
            db.session.add(Tipo(id=1, nome="Entrada")); db.session.add(Tipo(id=2, nome="Saída")); db.session.commit()

inicializar_banco()

# --- ROTAS ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
        
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        token_2fa = request.form.get('token_2fa') # Campo novo do formulário
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            # CASO 1: Usuário tem 2FA ativado
            if user.totp_secret:
                if token_2fa:
                    # Se ele digitou o código, verifica
                    if user.verify_totp(token_2fa):
                        login_user(user)
                        return redirect(url_for('index'))
                    else:
                        flash('Código 2FA incorreto.')
                        return render_template('login.html', step='2fa', username=username, password=password)
                else:
                    # Se a senha tá certa mas não mandou token, mostra campo de 2FA
                    return render_template('login.html', step='2fa', username=username, password=password)
            
            # CASO 2: Usuário NÃO tem 2FA (Login normal)
            else:
                login_user(user)
                return redirect(url_for('index'))
        else:
            flash('Usuário ou senha inválidos.')
            
    return render_template('login.html', step='login')

@app.route('/logout')
@login_required
def logout(): logout_user(); return redirect(url_for('login'))

# ==========================================
#           ROTAS DE 2FA (NOVO)
# ==========================================

@app.route('/setup-2fa')
@login_required
def setup_2fa():
    # Se o usuário já tem 2FA, não precisa configurar de novo
    if current_user.totp_secret:
        flash('A autenticação de dois fatores já está ativada.')
        return redirect(url_for('index'))
    
    # 1. Gera um segredo aleatório se não existir
    secret = pyotp.random_base32()
    
    # 2. Gera a URL para o QR Code
    # Cria uma instância temporária do usuário só para gerar a URI, 
    # ou salvamos o secret temporariamente na sessão (vamos simplificar salvando no user mas sem confirmar ainda)
    
    # Gera a URL de provisionamento
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=current_user.username, issuer_name='Financas do Cris')
    
    # 3. Gera a imagem do QR Code
    img = qrcode.make(uri)
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    
    return render_template('setup_2fa.html', secret=secret, qr_code=img_str)

@app.route('/verify-2fa-setup', methods=['POST'])
@login_required
def verify_2fa_setup():
    secret = request.form.get('secret')
    token = request.form.get('token')
    
    totp = pyotp.TOTP(secret)
    
    if totp.verify(token):
        # Código correto! Salva o segredo no banco
        current_user.totp_secret = secret
        db.session.commit()
        flash('✅ 2FA ativado com sucesso!', 'success')
        return redirect(url_for('index'))
    else:
        flash('❌ Código incorreto. Tente novamente.', 'error')
        return redirect(url_for('setup_2fa'))

# ==========================================

@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = types.ReplyKeyboardMarkup(row_width=1, resize_keyboard=True)
    markup.add(types.KeyboardButton('🔥 Vencendo Hoje'), types.KeyboardButton('📅 Vencem este Mês'), types.KeyboardButton('🔮 Próximas Contas'))
    bot.reply_to(message, "Menu:", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == '🔥 Vencendo Hoje')
def verificar_hoje(message):
    with app.app_context():
        hoje = datetime.now(); data_str = hoje.strftime('%Y-%m-%d')
        vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = [f"- {v.descricao}" for v in vencimentos if v.tipo == 'fixo' and v.dia == hoje.day]
        variaveis = [f"- {v.descricao}" for v in vencimentos if v.tipo == 'variavel' and v.data_vencimento == data_str]
        enviar_resp(message, "⚠️ CONTAS PARA HOJE", fixas, variaveis)

@bot.message_handler(func=lambda message: message.text == '📅 Vencem este Mês')
def verificar_mes(message):
    with app.app_context():
        hoje = datetime.now(); vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = [f"- {v.descricao} (Dia {v.dia})" for v in vencimentos if v.tipo == 'fixo' and v.dia and v.dia >= hoje.day]
        variaveis = []
        for v in vencimentos:
            if v.tipo == 'variavel' and v.data_vencimento:
                try:
                    dt = datetime.strptime(v.data_vencimento, '%Y-%m-%d')
                    if dt.year == hoje.year and dt.month == hoje.month and dt.day >= hoje.day: variaveis.append(f"- {v.descricao} (Dia {dt.day})")
                except: pass
        enviar_resp(message, "📅 VENCEM ESTE MÊS", fixas, variaveis)

@bot.message_handler(func=lambda message: message.text == '🔮 Próximas Contas')
def verificar_futuro(message):
    with app.app_context():
        hoje = datetime.now(); prox_mes = 1 if hoje.month == 12 else hoje.month + 1; prox_ano = hoje.year + 1 if hoje.month == 12 else hoje.year
        data_corte = datetime(prox_ano, prox_mes, 1); vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = [f"- {v.descricao} (Dia {v.dia})" for v in vencimentos if v.tipo == 'fixo' and v.dia]
        variaveis = []
        for v in vencimentos:
            if v.tipo == 'variavel' and v.data_vencimento:
                try:
                    dt = datetime.strptime(v.data_vencimento, '%Y-%m-%d')
                    if dt >= data_corte: variaveis.append(f"- {v.descricao} ({dt.strftime('%d/%m/%Y')})")
                except: pass
        enviar_resp(message, "🔮 PRÓXIMAS CONTAS", fixas, variaveis)

def enviar_resp(msg, titulo, f, v):
    if not f and not v: return bot.reply_to(msg, "✅ Nada encontrado.")
    resp = [f"<b>{titulo}</b>"]
    if f: resp.append("\n<b>Fixas:</b>"); resp.extend(f)
    if v: resp.append("\n<b>Variáveis:</b>"); resp.extend(v)
    bot.reply_to(msg, "\n".join(resp), parse_mode="HTML")

def iniciar_bot():
    if bot:
        try: bot.infinity_polling()
        except: pass

@app.route('/')
@login_required 
def index(): return render_template('index.html')

@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename): return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/config/tipos', methods=['GET'])
@login_required
def get_tipos(): return jsonify([t.to_dict() for t in Tipo.query.all()])

@app.route('/api/config/subtipos', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_subtipos():
    if request.method == 'GET': return jsonify([s.to_dict() for s in Subtipo.query.all()])
    if request.method == 'POST':
        d = request.json; db.session.add(Subtipo(nome=d['nome'], tipo_id=d['tipo_id'])); db.session.commit(); return jsonify({"msg":"ok"})
    if request.method == 'DELETE':
        i = db.session.get(Subtipo, request.args.get('id'))
        if i: Categoria.query.filter_by(subtipo_id=i.id).delete(); db.session.delete(i); db.session.commit()
        return jsonify({"msg":"ok"})

@app.route('/api/config/categorias', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_categorias():
    if request.method == 'GET': return jsonify([c.to_dict() for c in Categoria.query.all()])
    if request.method == 'POST':
        d = request.json; db.session.add(Categoria(nome=d['nome'], subtipo_id=d['subtipo_id'])); db.session.commit(); return jsonify({"msg":"ok"})
    if request.method == 'DELETE':
        i = db.session.get(Categoria, request.args.get('id')); 
        if i: db.session.delete(i); db.session.commit()
        return jsonify({"msg":"ok"})

@app.route('/api/lancamentos', methods=['GET'])
@login_required
def get_lanc(): return jsonify([l.to_dict() for l in Lancamento.query.all()])

@app.route('/api/lancamentos', methods=['POST'])
@login_required
def criar_lanc():
    try:
        f = request.form; nome_arq = None
        if 'arquivo' in request.files:
            arq = request.files['arquivo']
            if arq.filename:
                nome_arq = str(int(time.time())) + "_" + secure_filename(arq.filename)
                arq.save(os.path.join(app.config['UPLOAD_FOLDER'], nome_arq))
        cat = int(f.get('categoria_id')) if f.get('categoria_id') and f.get('categoria_id') != 'null' else None
        db.session.add(Lancamento(data=f.get('data'), descricao=f.get('descricao'), tipo_id=int(f.get('tipo_id')), subtipo_id=int(f.get('subtipo_id')), categoria_id=cat, valor=float(f.get('valor')), efetivado=False, comprovante=nome_arq))
        db.session.commit(); return jsonify({"msg":"ok"}), 201
    except Exception as e: return jsonify({"erro": str(e)}), 400

@app.route('/api/lancamentos/<int:id>', methods=['DELETE'])
@login_required
def del_lanc(id):
    l = db.session.get(Lancamento, id)
    if l: db.session.delete(l); db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/lancamentos/<int:id>/status', methods=['PATCH'])
@login_required
def status_lanc(id):
    l = db.session.get(Lancamento, id)
    if l: l.efetivado = not l.efetivado; db.session.commit()
    return jsonify(l.to_dict())

@app.route('/api/vencimentos', methods=['GET', 'POST'])
@login_required
def api_venc():
    if request.method == 'GET': return jsonify([v.to_dict() for v in Vencimento.query.all()])
    d = request.json; db.session.add(Vencimento(descricao=d['descricao'], tipo=d['tipo'], dia=d.get('dia'), data_vencimento=d.get('data_vencimento'))); db.session.commit(); return jsonify({"msg":"ok"})

@app.route('/api/vencimentos/<int:id>/toggle', methods=['PATCH'])
@login_required
def toggle_v(id):
    v = db.session.get(Vencimento, id); 
    if v: v.ativo = not v.ativo; db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/vencimentos/<int:id>', methods=['DELETE'])
@login_required
def del_v(id):
    v = db.session.get(Vencimento, id); 
    if v: db.session.delete(v); db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/planejamento', methods=['GET'])
@login_required
def get_planejamento():
    ano = request.args.get('ano', datetime.now().year); arvore = {}
    sql = db.session.query(Tipo.nome, Subtipo.nome, Categoria.nome, Lancamento.data, Lancamento.valor).join(Tipo, Lancamento.tipo_id == Tipo.id).join(Subtipo, Lancamento.subtipo_id == Subtipo.id).outerjoin(Categoria, Lancamento.categoria_id == Categoria.id).filter(Lancamento.data.like(f'{ano}-%')).all()
    for t, s, c, d, v in sql:
        mes = int(d.split('-')[1]) - 1; c = c or "Outros"
        if t not in arvore: arvore[t] = {}
        if s not in arvore[t]: arvore[t][s] = {}
        if c not in arvore[t][s]: arvore[t][s][c] = [0.0]*12
        arvore[t][s][c][mes] += v
    return jsonify(arvore)

@app.route('/api/anos_disponiveis', methods=['GET'])
@login_required
def get_anos():
    q = db.session.query(func.substr(Lancamento.data, 1, 4)).distinct().all(); anos = [int(a[0]) for a in q if a[0]]; 
    if not anos: anos.append(datetime.now().year)
    return jsonify(sorted(list(set(anos))))

if __name__ == "__main__":
    t = threading.Thread(target=iniciar_bot); t.daemon = True; t.start()
    app.run(host='0.0.0.0', debug=True, use_reloader=False)
