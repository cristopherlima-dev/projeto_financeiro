# Usa uma imagem leve do Python 3.10
FROM python:3.11-slim

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Instala compiladores básicos (necessários para algumas libs matemáticas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copia as dependências e instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código
COPY . .

# Garante que a pasta de uploads exista
RUN mkdir -p uploads

# Informa ao Docker que o app roda na porta 5000
EXPOSE 5000

# Comando para iniciar o sistema
CMD ["python", "app.py"]
