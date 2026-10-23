import subprocess
import os

mensagem = """fix: auditoria completa - 10 correcoes criticas, medias e baixas

- CSV escapa ; e " (Excel nao quebra mais com emissores compostos)
- PDF escapa HTML (evita quebra com caracteres especiais)
- BackHandler fecha modal de reclassify tambem
- Validators: removida duplicata isValidBoleto e implementado modulo 11 para 48 digitos
- Notificacao e cancelada ao excluir conta (evita notificacao fantasma)
- Circuit breaker de CNPJ: nao bloqueia 4s se ja falhou nos ultimos 60s
- Tipo 'CONTA' removido (nunca usado)
- OCR em fonte mono (JetBrainsMono) para melhor legibilidade
- Variaveis nao usadas removidas de validators
- 3 novos testes: csv_escape, circuit_breaker, e validacao de modulo 11
- 66 testes automatizados passando sem leak
"""

with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

subprocess.run(["git", "add", "."], shell=True)
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)
if os.path.exists('commit_msg.txt'): os.remove('commit_msg.txt')
subprocess.run(["git", "push"], shell=True)
