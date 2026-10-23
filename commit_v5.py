import subprocess
import os

mensagem = """feat: extracao posicional, consulta CNPJ paralela e cache

- Implementada extracao posicional (usa blocos X/Y do ML Kit como fallback)
- Consulta de CNPJ em paralelo (BrasilAPI + OpenCNPJ + PublicaCNPJ, timeout 4s)
- Cache de CNPJ no SQLite (validade de 30 dias)
- CNAE mapeado para Academias, Saude e Juridico
- Fallback de emissor extrai nome do beneficiario para contas desconhecidas
- Corrigido NETMAXXI (com dois X e um I)
- 63 testes automatizados passando
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)
if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
