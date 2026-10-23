import subprocess

path = 'src/utils/extractor.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Corrigir escapes duplos dentro das expressões regulares literais
content = content.replace(r'[^\\d]', r'[^\d]')
content = content.replace(r'(\\d{2})', r'(\d{2})')
content = content.replace(r'(\\d{4})', r'(\d{4})')
content = content.replace(r'\\/', '/') # Corrige a barra da data
content = content.replace(r'\\s+', r'\s+')
content = content.replace(r'\\.', r'\.')
content = content.replace(r'\\\\', r'\\') # Limpa o excesso

# Corrigir as duas linhas de regex específicas da Referência e CNPJ
content = content.replace(
    'const refMatch = text.match(/(?:MES\\/ANO|Referencia)[^\\d]*(\\d{2})\\/(\\d{4})/i);',
    'const refMatch = text.match(/(?:MES\\/ANO|Referencia)[^\\d]*(\\d{2})\\/(\\d{4})/i);'
)
# Garantir que o CNPJ tambem esteja correto
content = content.replace(
    'const cnpjMatch = text.match(/\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}/);',
    'const cnpjMatch = text.match(/\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}/);'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Regex corrigidos no extractor.ts!")

print("\n🔍 Rodando verificação de tipos (tsc)...")
subprocess.run(["npx", "tsc", "--noEmit"], shell=True)

print("\n🧪 Rodando TODOS os testes...")
subprocess.run(["npm", "test"], shell=True)
