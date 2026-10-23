import subprocess
import os

mensagem = """test: adiciona testes de estresse de QA (54 testes no total)

- Testes de migracao e criacao das tabelas settings e learned_categories
- Testes de fallback do getSetting quando a tabela nao existe
- Testes de normalizacao de palavras-chave (sem acento, minusculo)
- Testes de prioridade do aprendizado sobre as regras fixas
- Testes de configuracao de notificacao (once vs daily, dias antes)
- Corrigido database.ts para criar todas as tabelas no initDatabase
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
