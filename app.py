import os
import time
import threading
import telebot 
from telebot import types
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from sqlalchemy import func
from dotenv import load_dotenv

# Carrega as variáveis do arquivo .env
load_dotenv()

app = Flask(__name__)

# --- CONFIGURAÇÕES ---
# Usa variável de ambiente ou define um padrão seguro para local
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key') 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///financeiro.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'

# --- DADOS DO TELEGRAM (SEGURO) ---
# Busca do .env. Se não achar, o bot não inicia.
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")

if not TELEGRAM_TOKEN:
    print("ERRO: Token do Telegram não encontrado no arquivo .env")

bot = telebot.TeleBot(TELEGRAM_TOKEN)

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

db = SQLAlchemy(app)

# --- MODELOS ---

class Tipo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    
    def to_dict(self):
        return {"id": self.id, "nome": self.nome}

class Subtipo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    tipo_id = db.Column(db.Integer, db.ForeignKey('tipo.id'), nullable=False)
    
    def to_dict(self):
        return {"id": self.id, "nome": self.nome, "tipo_id": self.tipo_id}

class Categoria(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    subtipo_id = db.Column(db.Integer, db.ForeignKey('subtipo.id'), nullable=False)

    def to_dict(self):
        return {"id": self.id, "nome": self.nome, "subtipo_id": self.subtipo_id}

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
            "id": self.id,
            "data": self.data,
            "descricao": self.descricao,
            "tipo": t.nome if t else "N/A",
            "subtipo": s.nome if s else "N/A",
            "categoria": c.nome if c else "-",
            "valor": self.valor,
            "efetivado": self.efetivado,
            "comprovante": self.comprovante
        }

class Vencimento(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    descricao = db.Column(db.String(100), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)
    dia = db.Column(db.Integer, nullable=True)
    data_vencimento = db.Column(db.String(10), nullable=True)
    ativo = db.Column(db.Boolean, default=False) 

    def to_dict(self):
        return {
            "id": self.id,
            "descricao": self.descricao,
            "tipo": self.tipo,
            "dia": self.dia,
            "data_vencimento": self.data_vencimento,
            "ativo": self.ativo
        }

def inicializar_banco():
    with app.app_context():
        db.create_all()
        if not db.session.get(Tipo, 1):
            db.session.add(Tipo(id=1, nome="Entrada"))
            db.session.add(Tipo(id=2, nome="Saída"))
            db.session.commit()

inicializar_banco()

# ==========================================
#        LÓGICA DO BOT
# ==========================================

@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = types.ReplyKeyboardMarkup(row_width=1, resize_keyboard=True)
    markup.add(types.KeyboardButton('🔥 Vencendo Hoje'), types.KeyboardButton('📅 Vencem este Mês'), types.KeyboardButton('🔮 Próximas Contas'))
    bot.reply_to(message, "Menu:", reply_markup=markup)

@bot.message_handler(func=lambda message: message.text == '🔥 Vencendo Hoje')
def verificar_hoje(message):
    with app.app_context():
        hoje = datetime.now()
        data_str = hoje.strftime('%Y-%m-%d')
        
        vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = []
        variaveis = []

        for v in vencimentos:
            if v.tipo == 'fixo' and v.dia == hoje.day:
                fixas.append(f"- {v.descricao} (Todo dia {v.dia})")
            elif v.tipo == 'variavel' and v.data_vencimento == data_str:
                variaveis.append(f"- {v.descricao} (Vence Hoje)")

        enviar_resp(message, "⚠️ CONTAS PARA HOJE", fixas, variaveis)

@bot.message_handler(func=lambda message: message.text == '📅 Vencem este Mês')
def verificar_mes(message):
    with app.app_context():
        hoje = datetime.now()
        vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = []
        variaveis = []

        for v in vencimentos:
            if v.tipo == 'fixo' and v.dia:
                if v.dia >= hoje.day:
                    fixas.append(f"- {v.descricao} (Dia {v.dia})")
            
            elif v.tipo == 'variavel' and v.data_vencimento:
                try:
                    dt = datetime.strptime(v.data_vencimento, '%Y-%m-%d')
                    if dt.year == hoje.year and dt.month == hoje.month and dt.day >= hoje.day:
                        data_fmt = dt.strftime('%d/%m/%Y')
                        variaveis.append(f"- {v.descricao} (Vence dia {dt.day})")
                except: pass

        enviar_resp(message, "📅 VENCEM ESTE MÊS", fixas, variaveis)

@bot.message_handler(func=lambda message: message.text == '🔮 Próximas Contas')
def verificar_futuro(message):
    with app.app_context():
        hoje = datetime.now()
        prox_mes = 1 if hoje.month == 12 else hoje.month + 1
        prox_ano = hoje.year + 1 if hoje.month == 12 else hoje.year
        data_corte = datetime(prox_ano, prox_mes, 1)

        vencimentos = Vencimento.query.filter_by(ativo=True).all()
        fixas = []
        variaveis = []

        for v in vencimentos:
            if v.tipo == 'fixo' and v.dia:
                fixas.append(f"- {v.descricao} (Todo dia {v.dia})")
            
            elif v.tipo == 'variavel' and v.data_vencimento:
                try:
                    dt = datetime.strptime(v.data_vencimento, '%Y-%m-%d')
                    if dt >= data_corte:
                        data_fmt = dt.strftime('%d/%m/%Y')
                        variaveis.append(f"- {v.descricao} ({data_fmt})")
                except: pass

        enviar_resp(message, "🔮 PRÓXIMAS CONTAS (Mês que vem em diante)", fixas, variaveis)

def enviar_resp(msg, titulo, f, v):
    if not f and not v: return bot.reply_to(msg, "✅ Nada encontrado para este período.")
    
    resposta = [f"<b>{titulo}</b>"]
    if f: resposta.append("\n<b>Fixas:</b>"); resposta.extend(f)
    if v: resposta.append("\n<b>Variáveis:</b>"); resposta.extend(v)
        
    bot.reply_to(msg, "\n".join(resposta), parse_mode="HTML")

def iniciar_bot():
    try: bot.infinity_polling()
    except: pass

# ==========================================
#          ROTAS API
# ==========================================

@app.route('/')
def index(): return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename): return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/resetar_tudo')
def reset_db():
    try:
        db.drop_all()
        db.create_all()
        inicializar_banco()
        return "Banco resetado."
    except Exception as e: return f"Erro: {e}"

@app.route('/api/config/tipos', methods=['GET'])
def get_tipos():
    return jsonify([t.to_dict() for t in Tipo.query.all()])

@app.route('/api/config/subtipos', methods=['GET', 'POST', 'DELETE'])
def api_subtipos():
    if request.method == 'GET':
        return jsonify([s.to_dict() for s in Subtipo.query.all()])
    if request.method == 'POST':
        d = request.json
        db.session.add(Subtipo(nome=d['nome'], tipo_id=d['tipo_id']))
        db.session.commit()
        return jsonify({"msg":"ok"})
    if request.method == 'DELETE':
        item = db.session.get(Subtipo, request.args.get('id'))
        if item: 
            Categoria.query.filter_by(subtipo_id=item.id).delete()
            db.session.delete(item)
            db.session.commit()
        return jsonify({"msg":"ok"})

@app.route('/api/config/categorias', methods=['GET', 'POST', 'DELETE'])
def api_categorias():
    if request.method == 'GET':
        return jsonify([c.to_dict() for c in Categoria.query.all()])
    if request.method == 'POST':
        d = request.json
        db.session.add(Categoria(nome=d['nome'], subtipo_id=d['subtipo_id']))
        db.session.commit()
        return jsonify({"msg":"ok"})
    if request.method == 'DELETE':
        item = db.session.get(Categoria, request.args.get('id'))
        if item: db.session.delete(item); db.session.commit()
        return jsonify({"msg":"ok"})

@app.route('/api/lancamentos', methods=['GET'])
def get_lanc(): return jsonify([l.to_dict() for l in Lancamento.query.all()])

@app.route('/api/lancamentos', methods=['POST'])
def criar_lanc():
    try:
        f = request.form
        nome_arq = None
        if 'arquivo' in request.files:
            arq = request.files['arquivo']
            if arq.filename:
                nome_arq = str(int(time.time())) + "_" + secure_filename(arq.filename)
                arq.save(os.path.join(app.config['UPLOAD_FOLDER'], nome_arq))
        
        cat_raw = f.get('categoria_id')
        cat_id = int(cat_raw) if cat_raw and cat_raw != 'null' and cat_raw != '' else None

        db.session.add(Lancamento(
            data=f.get('data'), descricao=f.get('descricao'),
            tipo_id=int(f.get('tipo_id')), subtipo_id=int(f.get('subtipo_id')), 
            categoria_id=cat_id, valor=float(f.get('valor')), 
            efetivado=False, comprovante=nome_arq
        ))
        db.session.commit()
        return jsonify({"msg":"ok"}), 201
    except Exception as e: return jsonify({"erro": str(e)}), 400

@app.route('/api/lancamentos/<int:id>', methods=['DELETE'])
def del_lanc(id):
    l = db.session.get(Lancamento, id)
    if l: db.session.delete(l); db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/lancamentos/<int:id>/status', methods=['PATCH'])
def status_lanc(id):
    l = db.session.get(Lancamento, id)
    if l: l.efetivado = not l.efetivado; db.session.commit()
    return jsonify(l.to_dict())

@app.route('/api/vencimentos', methods=['GET'])
def get_venc(): return jsonify([v.to_dict() for v in Vencimento.query.all()])

@app.route('/api/vencimentos', methods=['POST'])
def criar_venc():
    d = request.json
    db.session.add(Vencimento(descricao=d['descricao'], tipo=d['tipo'], dia=d.get('dia'), data_vencimento=d.get('data_vencimento')))
    db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/vencimentos/<int:id>/toggle', methods=['PATCH'])
def toggle_v(id):
    v = db.session.get(Vencimento, id)
    if v: v.ativo = not v.ativo; db.session.commit()
    return jsonify({"msg":"ok"})

@app.route('/api/vencimentos/<int:id>', methods=['DELETE'])
def del_v(id):
    v = db.session.get(Vencimento, id)
    if v: db.session.delete(v); db.session.commit()
    return jsonify({"msg":"ok"})

# --- NOVA ROTA: PLANEJAMENTO ANUAL ---
@app.route('/api/planejamento', methods=['GET'])
def get_planejamento():
    ano = request.args.get('ano', datetime.now().year)
    sql = db.session.query(Tipo.nome, Subtipo.nome, Categoria.nome, Lancamento.data, Lancamento.valor)\
     .join(Tipo, Lancamento.tipo_id == Tipo.id)\
     .join(Subtipo, Lancamento.subtipo_id == Subtipo.id)\
     .outerjoin(Categoria, Lancamento.categoria_id == Categoria.id)\
     .filter(Lancamento.data.like(f'{ano}-%'))\
     .all()

    arvore = {} 
    for tipo, subtipo, categoria, data, valor in sql:
        mes = int(data.split('-')[1]) - 1
        categoria = categoria or "Outros"
        if tipo not in arvore: arvore[tipo] = {}
        if subtipo not in arvore[tipo]: arvore[tipo][subtipo] = {}
        if categoria not in arvore[tipo][subtipo]: arvore[tipo][subtipo][categoria] = [0.0] * 12
        arvore[tipo][subtipo][categoria][mes] += valor
    return jsonify(arvore)

# --- CORREÇÃO AQUI: ANOS DISPONÍVEIS ---
@app.route('/api/anos_disponiveis', methods=['GET'])
def get_anos_disponiveis():
    # Busca apenas os anos que existem na tabela de lançamentos
    query = db.session.query(func.substr(Lancamento.data, 1, 4)).distinct().all()
    
    anos = [int(ano[0]) for ano in query if ano[0]]
    
    # Se não tiver NENHUM lançamento, mostra o ano atual para não bugar a tela
    if not anos:
        anos.append(datetime.now().year)
    
    return jsonify(sorted(list(set(anos))))

if __name__ == "__main__":
    t = threading.Thread(target=iniciar_bot)
    t.daemon = True 
    t.start()
    app.run(debug=True, use_reloader=False)