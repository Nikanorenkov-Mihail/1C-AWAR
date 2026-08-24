import chromadb
from chromadb.utils import embedding_functions
import os
import re

# 1. Настройка эмбеддера (бесплатный, работает локально)
embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="intfloat/multilingual-e5-large"  # отлично понимает русский и код
)

# 2. Подключаемся к БД (хранится в папке ./chroma_1c)
client = chromadb.PersistentClient(path="./chroma_1c")
collection = client.get_or_create_collection(
    name="1c_project",
    embedding_function=embedder
)

# 3. Функция чтения ваших файлов (пример для .txt/.bsl/.xml)
def read_1c_files(folder_path):
    docs = []
    ids = []
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.endswith(('.bsl', '.txt', '.xml')):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Разбиваем на смысловые куски (по 500 символов)
                    chunks = [content[i:i+500] for i in range(0, len(content), 500)]
                    for i, chunk in enumerate(chunks):
                        docs.append(chunk)
                        ids.append(f"{file}_{i}")
    return docs, ids

# 4. Загружаем в Chroma
folder = "C:/Your1CProject/"  # укажите свою папку
texts, ids = read_1c_files(folder)

# Добавляем метаданные (имя файла, путь)
metadatas = [{"source": id.split('_')[0]} for id in ids]

collection.add(
    documents=texts,
    ids=ids,
    metadatas=metadatas
)

print(f"Проиндексировано {len(texts)} фрагментов")

def search_1c_code(query, n_results=3):
    results = collection.query(
        query_texts=[query],
        n_results=n_results
    )
    # Возвращаем найденные куски кода с источниками
    return [
        f"Из файла {meta['source']}:\n{doc}"
        for doc, meta in zip(results['documents'][0], results['metadatas'][0])
    ]