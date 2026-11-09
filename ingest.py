import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from chromadb import Client
from chromadb.utils import embedding_functions

# 1. Load the PDF
reader = PdfReader("docs/build123d_docs.pdf")
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"

# 2. Split into chunks
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_text(text)

# 3. Setup ChromaDB with local FastEmbed
client = Client()
embedding_fn = embedding_functions.FastEmbedEmbeddingFunction(model_name="BAAI/bge-small-en-v1.5")
collection = client.create_collection(name="build123d_docs", embedding_function=embedding_fn)

# 4. Store in vector database
ids = [f"doc_{i}" for i in range(len(chunks))]
collection.add(documents=chunks, ids=ids)
print(f"Indexed {len(chunks)} chunks into ChromaDB.")
