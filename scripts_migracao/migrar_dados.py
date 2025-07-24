# ==============================================================================
# ARQUIVO: scripts_migracao/migrar_dados.py
# VERSÃO FINAL - NOMES CORRESPONDENTES ENTRE KML E EXCEL
# ==============================================================================

import sqlite3
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon, mapping
import xml.etree.ElementTree as ET
from unidecode import unidecode
import json
import os

# ==============================================================================
# FUNÇÕES AUXILIARES
# ==============================================================================

def extrair_dados_kml(kml_bytes):
    """
    Extrai dados de polígonos e pontos do arquivo KML.
    Versão atualizada para lidar com prefixos de namespace (ex: ns0:).
    """
    try:
        if not kml_bytes:
            raise ValueError("Conteúdo KML está vazio.")
        
        kml_string = kml_bytes.decode("utf-8")
        
        # REMOVE TODOS OS PREFIXOS DE NAMESPACE (ex: ns0:Placemark -> Placemark)
        # Isso torna a busca por tags mais robusta.
        kml_string = kml_string.replace('xmlns="http://www.opengis.net/kml/2.2"', '' ) # Remove o namespace padrão
        kml_string = kml_string.replace('ns0:', '') # Remove o prefixo ns0:
        kml_string = kml_string.replace('gx:', '') # Remove o prefixo gx: (comum em KMLs)
        
        tree = ET.fromstring(kml_string)
        
        dados = []
        placemark_count = 0
        geometry_found_count = 0

        for placemark in tree.findall(".//Placemark"):
            placemark_count += 1
            
            # Tenta encontrar o nome da fazenda
            nome_fazenda = None
            
            # Primeiro, tenta encontrar na tag <name>
            name_node = placemark.find("name")
            if name_node is not None:
                nome_fazenda = name_node.text
            
            # Se não encontrou, tenta encontrar no ExtendedData/SimpleData com name="NOME_FAZ"
            if nome_fazenda is None:
                extended_data = placemark.find(".//ExtendedData")
                if extended_data is not None:
                    for simple_data in extended_data.findall(".//SimpleData"):
                        if simple_data.get("name") == "NOME_FAZ":
                            nome_fazenda = simple_data.text
                            break
            
            # Se ainda não encontrou, usa um nome padrão
            if nome_fazenda is None:
                nome_fazenda = f"Fazenda Sem Nome {placemark_count}"
            
            geometry = None
            
            # Tenta encontrar um Polígono (incluindo dentro de MultiGeometry)
            polygon_node = placemark.find(".//Polygon/outerBoundaryIs/LinearRing/coordinates")
            if polygon_node is not None:
                coords_text = polygon_node.text.strip()
                coords_list = []
                for point_str in coords_text.split():
                    coords = list(map(float, point_str.split(",")))
                    coords_list.append((coords[0], coords[1]))  # longitude, latitude
                geometry = Polygon(coords_list)
                geometry_found_count += 1

            # Se não achou polígono, tenta encontrar um Ponto
            if geometry is None:
                point_node = placemark.find(".//Point/coordinates")
                if point_node is not None:
                    coords_text = point_node.text.strip()
                    coords = list(map(float, coords_text.split(",")))
                    # Cria um pequeno buffer ao redor do ponto
                    point_obj = gpd.points_from_xy([coords[0]], [coords[1]])[0]
                    geometry = point_obj.buffer(0.001)
                    print(f"Aviso: '{nome_fazenda}' foi encontrada como PONTO. Criando área pequena ao redor.")
                    geometry_found_count += 1

            if geometry:
                dados.append({"NOME_FAZ": nome_fazenda, "geometry": geometry})

        print(f"-> KML processado: {placemark_count} locais encontrados, {geometry_found_count} geometrias válidas extraídas.")

        if not dados:
            raise ValueError("Nenhuma geometria válida foi encontrada no arquivo KML.")
            
        return gpd.GeoDataFrame(dados, crs="EPSG:4326")

    except Exception as e:
        print(f"Erro crítico ao processar o arquivo KML: {e}")
        return gpd.GeoDataFrame()

def normalize_str(s):
    """
    Normaliza strings removendo acentos, espaços extras e convertendo para maiúsculas.
    """
    try:
        if not pd.notna(s):
            return ""
        
        text = str(s).strip()
        
        # Remove prefixos comuns
        if text.lower().startswith('fazenda '):
            text = text[8:]
        elif text.lower().startswith('faz. '):
            text = text[5:]

        # Remove acentos e converte para maiúsculas
        text = unidecode(text).upper()
        
        return text
    except Exception:
        return ""

# ==============================================================================
# FUNÇÕES DO BANCO DE DADOS
# ==============================================================================

def criar_banco():
    """Cria o banco de dados e as tabelas necessárias."""
    db_path = '../backend/mapa_dados.db'
    print(f"Criando banco de dados em: {db_path}")
    
    # Garante que a pasta backend existe
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Remove tabelas existentes para começar limpo
    cursor.execute('DROP TABLE IF EXISTS fazendas')
    cursor.execute('DROP TABLE IF EXISTS especialistas')
    
    # Cria tabela de especialistas
    cursor.execute('''
    CREATE TABLE especialistas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT UNIQUE,
        gestor TEXT,
        cidade_base TEXT,
        latitude_base REAL,
        longitude_base REAL
    )''')

    # Cria tabela de fazendas
    cursor.execute('''
    CREATE TABLE fazendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_fazenda TEXT,
        especialista_id INTEGER,
        geometria_json TEXT,
        latitude_centroide REAL,
        longitude_centroide REAL,
        FOREIGN KEY (especialista_id) REFERENCES especialistas (id)
    )''')
    
    conn.commit()
    conn.close()
    print("-> Banco de dados e tabelas criados com sucesso!")

def migrar(caminho_kml, caminho_xlsx):
    """Migra os dados dos arquivos para o banco de dados."""
    db_path = '../backend/mapa_dados.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # --- ETAPA 1: PROCESSAR EXCEL ---
    print("\n--- Processando arquivo Excel ---")
    df_analistas = pd.read_excel(caminho_xlsx)
    
    # Normaliza nomes das colunas
    df_analistas.columns = [normalize_str(col) for col in df_analistas.columns]
    
    # Verifica se as colunas necessárias existem
    colunas_necessarias = ['ESPECIALISTA', 'GESTOR', 'CIDADE_BASE', 'COORDENADAS_CIDADE', 'UNIDADE']
    for col in colunas_necessarias:
        if col not in df_analistas.columns:
            raise ValueError(f"Coluna essencial '{col}' não encontrada no arquivo Excel. Colunas disponíveis: {list(df_analistas.columns)}")

    # Processa coordenadas
    coords = df_analistas["COORDENADAS_CIDADE"].astype(str).str.replace("'", "").str.split(",", expand=True)
    df_analistas["LAT_BASE"] = pd.to_numeric(coords[0], errors='coerce')
    df_analistas["LON_BASE"] = pd.to_numeric(coords[1], errors='coerce')
    
    # Normaliza nomes das unidades
    df_analistas["UNIDADE_normalized"] = df_analistas["UNIDADE"].apply(normalize_str)

    print(f"-> Excel processado: {len(df_analistas)} registros de especialistas/unidades encontrados.")

    # --- ETAPA 2: PROCESSAR KML ---
    print("\n--- Processando arquivo KML ---")
    with open(caminho_kml, 'rb') as f:
        kml_content = f.read()
    
    gdf_kml = extrair_dados_kml(kml_content)
    
    if gdf_kml.empty:
        raise ValueError("Nenhuma fazenda foi carregada do arquivo KML.")
        
    # Normaliza nomes das fazendas
    gdf_kml["UNIDADE_normalized"] = gdf_kml["NOME_FAZ"].apply(normalize_str)

    # --- ETAPA 3: VERIFICAR CORRESPONDÊNCIAS ---
    print("\n--- Verificando correspondências entre Excel e KML ---")
    unidades_excel = set(df_analistas['UNIDADE_normalized'].unique())
    unidades_kml = set(gdf_kml['UNIDADE_normalized'].unique())
    
    correspondencias = unidades_excel & unidades_kml
    print(f"-> {len(correspondencias)} correspondências encontradas entre Excel e KML.")
    
    if len(correspondencias) == 0:
        print("AVISO: Nenhuma correspondência encontrada!")
        print("Unidades no Excel:", sorted(list(unidades_excel))[:10])
        print("Fazendas no KML:", sorted(list(unidades_kml))[:10])
        raise ValueError("Nenhuma correspondência encontrada entre os nomes das unidades.")

    # --- ETAPA 4: INSERIR ESPECIALISTAS ---
    print("\n--- Inserindo especialistas no banco ---")
    especialistas_unicos = df_analistas.dropna(subset=['ESPECIALISTA']).drop_duplicates(subset=['ESPECIALISTA'])
    
    for _, row in especialistas_unicos.iterrows():
        cursor.execute(
            "INSERT OR IGNORE INTO especialistas (nome, gestor, cidade_base, latitude_base, longitude_base) VALUES (?, ?, ?, ?, ?)",
            (normalize_str(row['ESPECIALISTA']), normalize_str(row['GESTOR']), 
             normalize_str(row['CIDADE_BASE']), row['LAT_BASE'], row['LON_BASE'])
        )
    
    conn.commit()
    print(f"-> {len(especialistas_unicos)} especialistas únicos inseridos.")

    # --- ETAPA 5: JUNTAR DADOS E INSERIR FAZENDAS ---
    print("\n--- Juntando dados e inserindo fazendas ---")
    df_merged = pd.merge(
        df_analistas, gdf_kml,
        on="UNIDADE_normalized", how="inner"
    )
    
    if df_merged.empty:
        raise ValueError("A junção entre Excel e KML não produziu resultados.")

    for _, row in df_merged.iterrows():
        # Encontra o ID do especialista
        cursor.execute("SELECT id FROM especialistas WHERE nome = ?", (normalize_str(row['ESPECIALISTA']),))
        result = cursor.fetchone()
        
        if result:
            especialista_id = result[0]
            from shapely.geometry import mapping # Certifique-se que 'mapping' está importado no topo do arquivo
            geometria_geojson = json.dumps(mapping(row["geometry"])) # <-- LINHA CORRIGIDA
            
            cursor.execute(
                "INSERT INTO fazendas (nome_fazenda, especialista_id, geometria_json, latitude_centroide, longitude_centroide) VALUES (?, ?, ?, ?, ?)",
                (row['NOME_FAZ'], especialista_id, geometria_geojson, 
                 row['geometry'].centroid.y, row['geometry'].centroid.x)
            )

    conn.commit()
    print(f"-> {len(df_merged)} registros de fazendas inseridos com sucesso.")
    
    conn.close()
    print("\n*** MIGRAÇÃO DE DADOS CONCLUÍDA COM SUCESSO! ***")
    print(f"Banco de dados criado em: {os.path.abspath('../backend/mapa_dados.db')}")

# ==============================================================================
# PONTO DE PARTIDA DO SCRIPT
# ==============================================================================
if __name__ == "__main__":
    
    # Configuração dos arquivos
    nome_do_arquivo_kml = 'slc_mapa.kml'
    nome_do_arquivo_excel = 'tabelaraioatuacao.xlsx'
    
    # Verificação de arquivos
    print("--- Verificando arquivos de dados ---")
    if not os.path.exists(nome_do_arquivo_kml):
        raise FileNotFoundError(f"ERRO: Arquivo KML não encontrado: '{nome_do_arquivo_kml}'. Verifique se está na pasta 'scripts_migracao'.")
    if not os.path.exists(nome_do_arquivo_excel):
        raise FileNotFoundError(f"ERRO: Arquivo Excel não encontrado: '{nome_do_arquivo_excel}'. Verifique se está na pasta 'scripts_migracao'.")
    print("-> Arquivos encontrados com sucesso.")
    
    # Execução da migração
    try:
        criar_banco()
        migrar(nome_do_arquivo_kml, nome_do_arquivo_excel)
    except Exception as e:
        print(f"\n!!!!!!!!!! ERRO DURANTE A EXECUÇÃO !!!!!!!!!!")
        print(f"ERRO: {e}")
        print("!!!!!!!!!! A MIGRAÇÃO FALHOU !!!!!!!!!!")