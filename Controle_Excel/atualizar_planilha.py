import os
import sys
import csv
import shutil
from datetime import datetime
from openpyxl import Workbook, load_workbook

PASTA_ATUAL = os.path.dirname(os.path.abspath(__file__))
PLANILHA = os.path.join(PASTA_ATUAL, "Planilha_Contas.xlsx")

def main():
    print("="*40)
    print("   ATUALIZADOR DE PLANILHA - CONTROL RADAR")
    print("="*40)
    
    csvs = [f for f in os.listdir(PASTA_ATUAL) if f.endswith('.csv')]
    if not csvs:
        print("\n[!] Nenhum arquivo CSV encontrado nesta pasta.")
        print("-> Baixe o arquivo CSV do celular e coloque nesta pasta.")
        input("\nAperte Enter para sair...")
        return
        
    csv_path = os.path.join(PASTA_ATUAL, csvs[0])
    print(f"\n[1/3] Lendo arquivo: {csvs[0]}")

    if os.path.exists(PLANILHA):
        backup = PLANILHA.replace('.xlsx', f'_backup_{datetime.now().strftime("%Y%m%d%H%M%S")}.xlsx')
        shutil.copy2(PLANILHA, backup)
        print(f"[2/3] Backup da planilha criado: {os.path.basename(backup)}")
        wb = load_workbook(PLANILHA)
        ws = wb.active
    else:
        wb = Workbook()
        ws = wb.active
        ws.title = "Contas"
        headers = ["ID", "Tipo", "Emissor", "Referencia", "Vencimento", "Valor (R$)", "CNPJ", "Pago", "Linha Digitavel"]
        ws.append(headers)
        print("[2/3] Nova planilha criada.")
        
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        novas_linhas = list(reader)

    ids_existentes = set()
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=1, values_only=True):
        if row[0]:
            ids_existentes.add(str(row[0]))

    adicionadas = 0
    for linha in novas_linhas:
        if linha['ID'] not in ids_existentes:
            ws.append([
                linha['ID'], linha['Tipo'], linha['Emissor'], linha['Referencia'],
                linha['Vencimento'], linha['Valor (R$)'], linha['CNPJ'],
                linha['Pago'], linha['Linha Digitavel']
            ])
            adicionadas += 1

    wb.save(PLANILHA)
    print(f"[3/3] Sucesso! {adicionadas} novas contas adicionadas a planilha.")
    print(f"-> Arquivo salvo: {PLANILHA}")
    input("\nAperte Enter para fechar...")

if __name__ == "__main__":
    main()
