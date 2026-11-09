import chromadb
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from chromadb import EmbeddingFunction, Documents, Embeddings
from fastembed import TextEmbedding

# Define the custom Embedding Function for ChromaDB using FastEmbed
class FastEmbedEmbeddingFunction(EmbeddingFunction):
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        self.model = TextEmbedding(model_name=model_name)

    def __call__(self, input: Documents) -> Embeddings:
        # fastembed's .embed returns a generator; ChromaDB needs a list of lists
        return [list(map(float, e)) for e in self.model.embed(input)]

print("Loading PDF...")
reader = PdfReader("docs/build123d_docs.pdf")
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"

print("Splitting text...")
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_text(text)

print("Setting up ChromaDB...")
client = chromadb.PersistentClient(path="./chroma_db")
embedding_fn = FastEmbedEmbeddingFunction(model_name="BAAI/bge-small-en-v1.5")

# Delete the collection if it already exists to avoid duplicate entries
try:
    client.delete_collection(name="build123d_docs")
except:
    pass

collection = client.create_collection(name="build123d_docs", embedding_function=embedding_fn)

print("Indexing chunks into database (this may take a minute)...")
ids = [f"doc_{i}" for i in range(len(chunks))]
batch_size = 100
for i in range(0, len(chunks), batch_size):
    collection.add(
        documents=chunks[i:i+batch_size],
        ids=ids[i:i+batch_size]
    )

print(f"Successfully indexed {len(chunks)} chunks into ChromaDB.")
