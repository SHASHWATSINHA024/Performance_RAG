from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List
import shutil
import os
import uuid

# --- LLM and PDF processing imports ---
from llama_index.core import Document, VectorStoreIndex, SimpleDirectoryReader
from llama_index.readers.file import PDFReader
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding

app = FastAPI()

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./backend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory session storage: {session_id: {"pdfs": [filepaths], "history": [(user, bot)], "vector_index": ...}}
sessions = {}

@app.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...), session_id: str = Form(...)):
    session = sessions.setdefault(session_id, {"pdfs": [], "history": []})
    saved_files = []
    for file in files:
        file_id = str(uuid.uuid4())
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        session["pdfs"].append(file_path)
        saved_files.append(file.filename)
    return {"status": "ok", "files": saved_files}

@app.post("/chat")
async def chat(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    query = data.get("query")
    session = sessions.setdefault(session_id, {"pdfs": [], "history": []})
    pdf_files = session["pdfs"]
    if not pdf_files:
        answer = "No PDFs uploaded for this session. Please upload PDFs first."
        session["history"].append((query, answer))
        return JSONResponse({"answer": answer, "history": session["history"]})

    # --- LLM and embedding setup ---
    llm = Ollama(model="mistral", request_timeout=5*60)
    embedding = OllamaEmbedding(model_name="mistral", base_url="http://localhost:11434")

    # --- Agentic chunking and vector index (cache per session) ---
    if "vector_index" not in session:
        agentic_documents = []
        prop_prompt = (
            "Extract the main propositions or statements from the following paragraph. "
            "Return each as a separate line.\n\nParagraph:\n{text}\n\nPropositions:"
        )
        for file_path in pdf_files:
            filename = os.path.basename(file_path)
            doc_nodes = SimpleDirectoryReader(
                input_files=[file_path],
                file_extractor={".pdf": PDFReader()}
            ).load_data()
            print("building vector index")
            for node in doc_nodes:
                paragraphs = [p for p in node.get_content().split("\n\n") if p.strip()]
                for para in paragraphs:
                    prompt = prop_prompt.format(text=para)
                    result = llm.complete(prompt).text.strip()
                    for line in result.split("\n"):
                        line = line.strip("-•* \t")
                        if line:
                            agentic_documents.append(
                                Document(
                                    text=line,
                                    metadata={"source": "agentic", "pdf": filename}
                                )
                            )
            print("vector index built")
        vector_index = VectorStoreIndex(agentic_documents, embed_model=embedding)
        session["vector_index"] = vector_index
    else:
        vector_index = session["vector_index"]

    query_engine = vector_index.as_query_engine(llm=llm)
    response = query_engine.query(query)
    answer = str(response)
    session["history"].append((query, answer))
    return JSONResponse({"answer": answer, "history": session["history"]}) 