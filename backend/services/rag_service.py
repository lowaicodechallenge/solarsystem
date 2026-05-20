import json
import os
import chromadb
from chromadb.utils import embedding_functions
from pathlib import Path

_client = None
_collection = None

EXERCISES_PATH = Path(__file__).parent.parent / "data" / "exercises.json"


def get_chroma_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path="./chroma_db")
    return _client


def get_collection():
    global _collection
    if _collection is not None:
        return _collection

    client = get_chroma_client()
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="paraphrase-multilingual-MiniLM-L12-v2"
    )

    try:
        _collection = client.get_collection("exercises", embedding_function=ef)
        with open(EXERCISES_PATH, "r", encoding="utf-8") as f:
            expected_count = len(json.load(f))
        if _collection.count() != expected_count:
            client.delete_collection("exercises")
            _collection = client.create_collection("exercises", embedding_function=ef)
            _seed_exercises(_collection)
    except Exception:
        try:
            client.delete_collection("exercises")
        except Exception:
            pass
        _collection = client.create_collection("exercises", embedding_function=ef)
        _seed_exercises(_collection)

    return _collection


def _seed_exercises(collection):
    with open(EXERCISES_PATH, "r", encoding="utf-8") as f:
        exercises = json.load(f)

    ids = []
    documents = []
    metadatas = []

    for ex in exercises:
        doc = f"{ex['name']} {ex['category']} {' '.join(ex['target_muscles'])} {' '.join(ex['conditions'])} {' '.join(ex['posture_issues'])} {ex['description']}"
        ids.append(ex["id"])
        documents.append(doc)
        metadatas.append({
            "name": ex["name"],
            "category": ex["category"],
            "difficulty": ex["difficulty"],
            "duration_minutes": ex["duration_minutes"],
            "youtube_query": ex["youtube_query"],
            "conditions": json.dumps(ex["conditions"], ensure_ascii=False),
            "posture_issues": json.dumps(ex["posture_issues"], ensure_ascii=False),
            "corrections": json.dumps(ex["corrections"], ensure_ascii=False),
            "description": ex["description"],
        })

    collection.add(ids=ids, documents=documents, metadatas=metadatas)


def search_exercises(
    symptoms: str,
    posture_issues: list[str],
    exercise_type: str = "",
    n_results: int = 5,
) -> list[dict]:
    collection = get_collection()

    query_parts = []
    if symptoms:
        query_parts.append(symptoms)
    if posture_issues:
        query_parts.extend(posture_issues)
    if exercise_type:
        query_parts.append(exercise_type)

    if not query_parts:
        query_parts = ["전신 운동 자세 교정"]

    query = " ".join(query_parts)

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, 10),
    )

    exercises = []
    if results["ids"] and results["ids"][0]:
        for i, ex_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i]
            exercises.append({
                "id": ex_id,
                "name": meta["name"],
                "category": meta["category"],
                "difficulty": meta["difficulty"],
                "duration_minutes": meta["duration_minutes"],
                "youtube_query": meta["youtube_query"],
                "description": meta["description"],
                "corrections": json.loads(meta["corrections"]),
                "conditions": json.loads(meta["conditions"]),
                "posture_issues": json.loads(meta["posture_issues"]),
                "relevance_score": 1 - results["distances"][0][i] if results.get("distances") else 0.5,
            })

    return exercises


def get_rehab_advice(symptoms: str, posture_issues: list[str]) -> str:
    exercises = search_exercises(symptoms, posture_issues, n_results=3)
    if not exercises:
        return "맞춤 운동을 찾을 수 없습니다."

    advice_parts = []
    for ex in exercises:
        advice_parts.append(
            f"[{ex['name']}] {ex['description']} "
            f"핵심 포인트: {', '.join(ex['corrections'][:2])}"
        )
    return "\n\n".join(advice_parts)
