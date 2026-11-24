"""FastAPI app. Same routes and response shapes as the Django backend, under
/api/eval-bot/, so the frontend works against either.

    uvicorn app.main:app --reload --port 4000
"""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, errors
from .routers import auth, calls, metrics, runs, scenarios, testcases, users

app = FastAPI(title="Eval Bot API", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS,
    allow_credentials=True,  # the JWTs are cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
errors.install(app)

api = APIRouter(prefix="/api/eval-bot")
for module in (auth, users, scenarios, testcases, runs, metrics, calls):
    api.include_router(module.router)
app.include_router(api)
