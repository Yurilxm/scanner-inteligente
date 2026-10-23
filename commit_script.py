import subprocess
import os

# 1. Definindo a mensagem de commit perfeita
mensagem = """feat: data de pagamento, notificacoes, zoom e automacao excel

- Adicionado campo e modal de Data de Pagamento manual
- Implementado sistema de notificacoes locais (5 dias antes do vencimento)
- Adicionado zoom (pinca e toque duplo) na imagem de detalhes
- Adicionado preview de PDF (leitor nativo) e CSV (modal) antes de compartilhar
- Criado script Python para atualizar a planilha Excel a partir do CSV exportado
- Adicionado modal customizado de sucesso ao salvar documento
- Corrigido SafeArea e adicionado botoes de voltar customizados nas telas
- Atualizado icone, nome do app e suporte a dark mode nativo (expo-system-ui)
- Implementada validacao de linha digitavel (Modulos 10 e 11)
- Removido botao de debug de OCR (JSON)
- Atualizado README.md com as novas funcionalidades e workarounds
- Adicionados novos testes automatizados (30 testes passando)
"""

# 2. Salvar a mensagem num arquivo temporario
with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

# 3. Adicionar todos os arquivos e fazer o commit
print("📦 Adicionando arquivos (git add .)...")
subprocess.run(["git", "add", "."], shell=True)

print("\n💾 Criando o commit com a mensagem detalhada...")
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

# 4. Limpar o arquivo temporario
os.remove('commit_msg.txt')

print("\n🚀 Enviando para o GitHub (git push)...")
subprocess.run(["git", "push"], shell=True)
