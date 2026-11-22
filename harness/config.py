import torch

_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

CONFIG = {
    "embedding_model":          "intfloat/multilingual-e5-large",
    "reranker_model":           "BAAI/bge-reranker-v2-m3",
    "nlp_id_model":             "indobenchmark/indobert-base-p1",
    "nlp_device":               _DEVICE,
    "embedding_device":         _DEVICE,
    "reranker_device":          _DEVICE,

    "llm_provider":             "groq",
    "groq_model":               "openai/gpt-oss-120b",
    "ollama_model":             "llama3.1",

    "chroma_collection":        "batik_knowledge",
    "instruction_collection":   "instruction",
    "guard_rails_collection":   "guard_rails",
    "dataset_path":             "harness/dataset",
    "chroma_path":              "harness/chromadb",
    "max_tokens_per_chunk":     512,

    "max_chroma_retrieval_k":   4,
    "max_reranked_k":           2,
    "instruction_retrieval_k":  2,
    "guard_rails_retrieval_k":  2,

    "knowledge_max_new_tokens": 256,
    "knowledge_temperature":    0.2,
    "knowledge_top_p":          0.95,

    "social_max_new_tokens":    128,
    "social_temperature":       0.5,
    "social_top_p":             0.95,

    "product_max_new_tokens":   350,
    "product_recommendation_k": 3,
    "backend_product_path":     "/api/products/search",  # samakan dengan route di backend
    "backend_timeout":          10,

    "cache_backend":            "sqlite",
    "cache_ttl_seconds":        3600,
    "cache_max_memory_items":   500,
    "redis_prefix_harness":     "harness:llm:",
    "redis_prefix_backend":     "backend:",
}