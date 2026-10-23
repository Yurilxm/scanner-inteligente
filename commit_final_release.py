import subprocess
import os

mensagem = """fix: corrige extracao de valor (ruido de CNPJ/data), cache seguro e timers

- Remove CNPJ, CPF, datas e mes/ano antes de buscar valores (evita 34,19 virar valor)
- Valores inteiros só aceitos com R$ explicito (evita pegar ano 2026 como valor)
- Fallback de valor exclui anos (1900-2100)
- _layout.tsx protege boot contra falha do SQLite (try/catch)
- ocr.ts valida cacheDirectory antes de usar (erro amigavel)
- Cache CNPJ e timers protegidos (elimina leak de Jest)
- 63 testes automatizados passando sem leak
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)
if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
