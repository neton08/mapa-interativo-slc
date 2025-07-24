from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect('mapa_dados.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/dados_mapa")
def get_map_data():
    conn = get_db_connection()
    
    # Query de especialistas não muda
    especialistas = conn.execute("SELECT id, nome, gestor, cidade_base, latitude_base, longitude_base FROM especialistas").fetchall()
    
    # CORREÇÃO: A query de fazendas agora também busca a cidade_base do especialista
    # Isso garante que cada fazenda tenha toda a informação necessária para os pop-ups.
    fazendas = conn.execute("""
        SELECT 
            f.nome_fazenda, 
            f.geometria_json, 
            f.latitude_centroide, 
            f.longitude_centroide, 
            e.nome as especialista_nome,
            e.cidade_base as especialista_cidade_base  -- Adicionamos a cidade base aqui
        FROM fazendas f
        JOIN especialistas e ON f.especialista_id = e.id
    """).fetchall()
    
    conn.close()

    output = {
        "especialistas": [dict(row) for row in especialistas],
        "fazendas": [
            {
                "nome": row["nome_fazenda"],
                "especialista": row["especialista_nome"],
                "cidade_origem": row["especialista_cidade_base"], # Novo campo para o pop-up
                "centroide": [row["latitude_centroide"], row["longitude_centroide"]],
                "geometria": json.loads(row["geometria_json"])
            } 
            for row in fazendas
        ]
    }
    return output