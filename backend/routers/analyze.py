import io
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from models.schemas import AnalyzeResponse, AIAnalyzeResponse
from services.analyzer import ResumeAnalyzer
from services.ai_analyzer import AIResumeAnalyzer
from config.database import save_resume_data, save_analysis_data, save_ai_analysis_data, get_ai_analysis_stats
from config.job_roles import JOB_ROLES

router = APIRouter(prefix="/api", tags=["analyze"])

analyzer = ResumeAnalyzer()
ai_analyzer = AIResumeAnalyzer()


def _extract_text(file: UploadFile, contents: bytes) -> str:
    filename = (file.filename or "").lower()
    if not filename.endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF or DOCX.")
    try:
        if filename.endswith(".pdf"):
            return analyzer.extract_text_from_pdf(io.BytesIO(contents))
        return analyzer.extract_text_from_docx(io.BytesIO(contents))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="We couldn’t read this file. Upload a valid, unencrypted PDF or DOCX with selectable text.",
        ) from exc


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_resume(
    file: UploadFile = File(...),
    job_category: str = Form(...),
    job_role: str = Form(...),
):
    contents = await file.read()
    resume_text = _extract_text(file, contents)

    if not resume_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the uploaded file.")

    role_info = JOB_ROLES.get(job_category, {}).get(job_role)
    if not role_info:
        raise HTTPException(status_code=400, detail=f"Unknown role: {job_category} / {job_role}")

    result = analyzer.analyze_resume(
        {"raw_text": resume_text},
        {"required_skills": role_info["required_skills"]},
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    # Save to DB
    resume_id = save_resume_data({
        "personal_info": {
            "full_name": result.get("name", ""),
            "email": result.get("email", ""),
            "phone": result.get("phone", ""),
            "linkedin": result.get("linkedin", ""),
            "github": result.get("github", ""),
            "portfolio": result.get("portfolio", ""),
        },
        "summary": result.get("summary", ""),
        "target_role": job_role,
        "target_category": job_category,
        "education": result.get("education", []),
        "experience": result.get("experience", []),
        "projects": result.get("projects", []),
        "skills": result.get("skills", []),
    })

    if resume_id:
        save_analysis_data(resume_id, {
            "ats_score": result.get("ats_score", 0),
            "keyword_match_score": result.get("keyword_match", {}).get("score", 0),
            "format_score": result.get("format_score", 0),
            "section_score": result.get("section_score", 0),
            "missing_skills": ", ".join(result.get("keyword_match", {}).get("missing_skills", [])),
            "recommendations": "; ".join(result.get("suggestions", [])),
        })

    section_scores = result.get("section_scores")
    return AnalyzeResponse(
        ats_score=result.get("ats_score", 0),
        keyword_match=result.get("keyword_match", {"score": 0, "found_skills": [], "missing_skills": []}),
        format_score=result.get("format_score", 0),
        section_score=result.get("section_score", 0),
        suggestions=result.get("suggestions", []),
        name=result.get("name", ""),
        email=result.get("email", ""),
        phone=result.get("phone", ""),
        linkedin=result.get("linkedin", ""),
        github=result.get("github", ""),
        portfolio=result.get("portfolio", ""),
        document_type=result.get("document_type", "resume"),
        education=result.get("education", []),
        experience=result.get("experience", []),
        projects=result.get("projects", []),
        skills=result.get("skills", []),
        summary=result.get("summary", ""),
        section_scores=section_scores,
        contact_suggestions=result.get("contact_suggestions", []),
        summary_suggestions=result.get("summary_suggestions", []),
        skills_suggestions=result.get("skills_suggestions", []),
        experience_suggestions=result.get("experience_suggestions", []),
        education_suggestions=result.get("education_suggestions", []),
        format_suggestions=result.get("format_suggestions", []),
    )


@router.post("/analyze/ai", response_model=AIAnalyzeResponse)
async def ai_analyze_resume(
    file: UploadFile = File(...),
    job_role: str = Form(...),
    job_description: str = Form(""),
    model: str = Form("xAI Grok"),
):
    contents = await file.read()
    resume_text = _extract_text(file, contents)

    if not resume_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the uploaded file.")

    result = ai_analyzer.analyze_resume_with_ai(
        resume_text,
        job_description=job_description or None,
        job_role=job_role,
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    resume_id = save_resume_data({
        "personal_info": {"full_name": "", "email": "", "phone": ""},
        "target_role": job_role,
        "target_category": "",
    })

    if resume_id:
        save_ai_analysis_data(resume_id, {
            "model_used": model,
            "resume_score": result.get("resume_score", 0),
            "job_role": job_role,
        })

    return AIAnalyzeResponse(
        resume_score=result.get("resume_score", 0),
        ats_score=result.get("ats_score", 0),
        analysis=result.get("analysis", ""),
        model_used=model,
        strengths=result.get("strengths", []),
        weaknesses=result.get("weaknesses", []),
    )


@router.get("/analyze/stats")
async def analyze_stats():
    return get_ai_analysis_stats()


@router.get("/roles")
async def get_roles():
    return JOB_ROLES


@router.get("/roles/{category}")
async def get_roles_by_category(category: str):
    roles = JOB_ROLES.get(category)
    if not roles:
        raise HTTPException(status_code=404, detail=f"Category '{category}' not found")
    return roles
