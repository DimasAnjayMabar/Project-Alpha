from fastapi import APIRouter, Request

from schemas.chatbot_schemas import ChatQuestionRequest
from service.chatbot_service import check_rate_limit, submit_question, get_answer

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


# ==========================================
# 1. RUTE (publik, tanpa login)
# ==========================================
@router.post("/question")
def question_route(data: ChatQuestionRequest, request: Request):
    return controller_question(data, request)


@router.get("/answer")
def answer_route(job_id: str):
    return controller_answer(job_id)


# ==========================================
# 2. FUNGSI CONTROLLER
# ==========================================
def controller_question(data: ChatQuestionRequest, request: Request):
    # Identitas pengunjung untuk rate limit. Di belakang reverse proxy,
    # request.client.host adalah IP proxy; saat deploy perlu disesuaikan.
    client_id = request.client.host if request.client else "unknown"
    check_rate_limit(client_id)

    result = submit_question(data.query)
    return {"status": "success", "data": result}


def controller_answer(job_id: str):
    result = get_answer(job_id)
    return {"status": "success", "data": result}