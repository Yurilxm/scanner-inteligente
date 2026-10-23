import subprocess
import os

mensagem = """feat: reclassificacao inteligente e configuracoes de notificacao

- Adicionado botao "Reclassificar e Aprender" na tela de revisao e detalhes
- Criada tabela learned_categories no SQLite para aprendizado continuo
- Extrator atualizado para checar o banco de aprendizado antes das regras fixas
- Criada tela de configuracoes para personalizar notificacoes (dias e frequencia)
- Adicionado icone de engrenagem na Home
- 41 testes automatizados passando (incluindo edge cases e OCR pipeline)
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
