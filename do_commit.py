import subprocess
import os

# Mensagem de commit detalhada
mensagem = """feat: extrator baseado em OCRs reais + 71 testes passando

- Extrator reescrito com base nos textos reais de 5 boletos (Enel, Prolagos, UVA, Sicoob, NetMaxxi)
- Tolerante a erros do ML Kit: VENCIWENTO, Vencirmanto, 5102026, 1 O/2026
- Prioridade de valor: TOTAL A PAGAR > VALOR TOTAL > VALOR DO DOCUMENTO > fallback
- Fallback de data solta (Sicoob sem keyword de vencimento)
- Normalizacao de "1 O/" -> "10/" (NetMaxxi periodo de referencia)
- Indicadores de BOLETO ampliados (SICOOB, CONDOMIN, VALOR DO DOCUMENTO)
- Consulta de CNPJ em paralelo com circuit breaker de 60s
- Cache de CNPJ no SQLite (TTL 30 dias)
- Botao "Exportar OCR" na tela de revisao para debug
- Novo teste boletos_reais.test.ts com fixtures inline (5 boletos)
- README atualizado com novas features e 71 testes
"""

# 1. Salva a mensagem em arquivo temporário (UTF-8)
with open('commit_msg.txt', 'w', encoding='utf-8') as f:
    f.write(mensagem)

print("Adicionando arquivos (git add .)...")
subprocess.run(["git", "add", "."], shell=True)

print("Criando o commit...")
subprocess.run(["git", "commit", "-F", "commit_msg.txt"], shell=True)

# 2. Remove o arquivo temporário
if os.path.exists('commit_msg.txt'):
    os.remove('commit_msg.txt')

print("Enviando para o GitHub (git push)...")
subprocess.run(["git", "push"], shell=True)

print("\n✅ Commit finalizado com sucesso!")
