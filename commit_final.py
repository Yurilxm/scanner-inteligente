import subprocess
import os

mensagem = """feat: extrator inteligente, scripts de setup e correcoes finais

- Extrator reescrito com logica contextual (foco no tipo de conta, nao no banco)
- Suporte a Condominio, IPVA, Seguro, Gas, Vistoria, Faculdade, etc
- Corrigida extracao de data de vencimento (\\d no new RegExp)
- Corrigida extracao de valor priorizando "Total a Pagar"
- Criado setup_dev.ps1 para facilitar instalacao de devs
- Criado setup_excel.ps1 para criacao automatica da pasta da planilha
- Corrigido salvamento em branco, zoom, PDF e CSV
- 33 testes automatizados passando
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
