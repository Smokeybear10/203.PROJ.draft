import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config.database import init_database
from routers import analyze, jobs, feedback, dashboard, auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(title="DR4FT API", version="1.0.0", lifespan=lifespan)


def _cors_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(jobs.router)
app.include_router(feedback.router)
app.include_router(dashboard.router)
app.include_router(auth.router)


@app.get("/")
async def root():
    return {"message": "DR4FT API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=3200, reload=True)
