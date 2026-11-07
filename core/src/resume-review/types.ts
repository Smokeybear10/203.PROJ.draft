export type JobRole = { description: string; required_skills: string[] }
export type JobRoles = Record<string, Record<string, JobRole>>
export type SectionCheck = { name: string; found: boolean }
export type ReviewEvidence = {
  word_count: number
  page_count: number | null
  sections: SectionCheck[]
  extracted_text: string
}
export type ResumeAnalysis = {
  ats_score: number
  keyword_match: { score: number; found_skills: string[]; missing_skills: string[] }
  format_score: number
  section_score: number
  suggestions: string[]
  document_type: string
  evidence?: ReviewEvidence
}
