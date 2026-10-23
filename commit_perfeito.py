import subprocess
import os

mensagem = """feat: perfis de usuario, data de pagamento e correcoes de UI/UX

- Implementado sistema de perfis separados (Yuri e Mae) com bancos SQLite independentes
- Adicionado seletor de perfil na tela Home
- Adicionado campo e modal de Data de Pagamento manual
- Corrigido preview de CSV com layout legivel em formato de cards
- Implementado fallback de PDF para o visualizador nativo do Android
- Corrigido bug da tela branca ao salvar documento
- Corrigido conflito de gestos no Zoom da imagem
- Removido botao de debug de OCR da tela de revisao
- Adicionados 7 novos testes automatizados (33 testes passando no total)
- Atualizado README.md com as novas funcionalidades
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

print("📦 Adicionando arquivos...")
subprocess.run(["git", "add", "."], shell=True)

print("💾 Criando o commit...")
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

os.remove('commit_msg.txt')

print("🚀 Enviando para o GitHub...")
subprocess.run(["git", "push"], shell=True)
