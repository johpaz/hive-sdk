/**
 * HiveDB-based Dynamic Skill Selector Module
 *
 * Context Compiler Level 4 - Intelligent Skill Selection
 *
 * Uses HiveDB hybrid search (BM25 + optional vector) over the skills index.
 */

import { getHiveDB } from "../../storage/HiveDBStorage.ts"
import { logger } from "../../utils/logger.ts"
import type { HiveSkillDoc } from "../../storage/hiveSeed.ts"
import type { IndexDoc } from "@johpaz/hive-db"

const log = logger.child("skill-selector")

// ─── Minimal Skill Set ─────────────────────────────────────────────────────────

export const MINIMAL_SKILL_NAMES = new Set([
  "memory_manager",
  "canvas_report",
  "task_orchestrator",
])

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface SkillDescriptor {
    id: string
    name: string
    description: string
    category: string
    tools: string
    triggers: string
    preferred_agents: string
    body: string
    version: string
    version_num: number
    active: number
}

export interface SelectedSkill {
    id: string
    name: string
    score: number
    category: string
    description: string
    body: string
}

export interface SkillSelectorResult {
    skills: SkillDescriptor[]
    selected: SelectedSkill[]
    reasoning: string
    timingMs: number
}

// ─── Configuration ─────────────────────────────────────────────────────────

const MAX_SKILLS_PER_TURN = 4

const MIN_RELEVANCE_THRESHOLD = 0.5

const STOPWORDS = new Set([
    "que", "con", "para", "por", "una", "uno", "los", "las", "del",
    "como", "esta", "esto", "ese", "eso", "the", "and", "for",
    "with", "this", "that", "have", "will", "also", "de", "en",
    "el", "la", "se", "su", "sus", "al", "es", "son", "pero",
    "más", "mas", "ya", "yo", "tu", "te", "ti", "mi", "me",
    "hola", "hi", "hello", "hey", "gracias", "thank", "please",
    "ok", "okay", "yes", "si", "no", "bien", "good", "great",
    "puedes", "necesito", "quiero", "podés", "necesitás", "querés",
])

const CONVERSATIONAL_PATTERNS = [
    /^(hola|hi|hello|hey|buenos? días?|buenas? noches?|qué tal|howdy)/i,
    /^(gracias|thank you|thanks|muchas gracias|muchas thanks)/i,
    /^(cómo estás?|how are you?|qué流水|you doing|qué cuentas)/i,
    /^(sí|yes|ok|okay|de acuerdo|perfecto|claro|por supuesto)/i,
    /^(adiós|bye|nos vemos|see you|later|chau)/i,
    /^(entiendo|understand|i see|ya veo|got it)/i,
    /^(bien|good|great|excelente|awesome|perfect)/i,
    /^(?:\?|¿)$/,
]

// ─── Helper Functions ───────────────────────────────────────────────────────

function isConversational(message: string): boolean {
    const trimmed = message.trim()
    if (trimmed.length < 2) return true
    for (const pattern of CONVERSATIONAL_PATTERNS) {
        if (pattern.test(trimmed)) {
            log.debug(`[skill-selector] Message matched conversational pattern: ${pattern}`)
            return true
        }
    }
    const words = trimmed.toLowerCase().split(/\s+/)
    const meaningfulWords = words.filter(w => w.length > 2 && !STOPWORDS.has(w))
    if (meaningfulWords.length === 0) {
        log.debug(`[skill-selector] All words are stopwords - conversational`)
        return true
    }
    return false
}

function buildFTSQuery(message: string): string {
    const words = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .slice(0, 8)

    if (words.length === 0) return ""
    return words.join(" ")
}

function matchTriggers(message: string, triggers: string[]): boolean {
    if (!triggers || triggers.length === 0) return false
    const lowerMessage = message.toLowerCase()
    return triggers.some(trigger =>
        lowerMessage.includes(trigger.toLowerCase())
    )
}

function toSkillDescriptor(doc: HiveSkillDoc): SkillDescriptor {
    return {
        id: doc.id,
        name: doc.name,
        description: doc.description,
        category: doc.category,
        tools: Array.isArray(doc.tools) ? doc.tools.join(",") : String(doc.tools ?? ""),
        triggers: Array.isArray(doc.triggers) ? doc.triggers.join(",") : String(doc.triggers ?? ""),
        preferred_agents: Array.isArray(doc.preferredAgents) ? doc.preferredAgents.join(",") : String(doc.preferredAgents ?? ""),
        body: doc.body,
        version: doc.version,
        version_num: doc.versionNum,
        active: doc.active ? 1 : 0,
    }
}

// ─── Main Selection Function ─────────────────────────────────────────────────

export async function selectSkills(userMessage: string): Promise<SkillDescriptor[]> {
    const startTime = performance.now()

    log.debug(`[skill-selector] Processing user message: "${userMessage.substring(0, 100)}"`)

    if (isConversational(userMessage)) {
        log.debug(`[skill-selector] Conversational message, returning empty array`)
        return []
    }

    const db = await getHiveDB()
    const skillsCol = db.collection<HiveSkillDoc>("skills")
    const entries = await skillsCol.scan()
    const allSkills = entries.map(e => e.doc).filter(s => s.active)

    for (const skill of allSkills) {
        if (matchTriggers(userMessage, skill.triggers)) {
            log.info(`[skill-selector] Trigger match found: ${skill.name}`)
            return [toSkillDescriptor(skill)]
        }
    }

    const ftsQuery = buildFTSQuery(userMessage)
    if (!ftsQuery) {
        log.debug(`[skill-selector] No valid query terms, returning empty array`)
        return []
    }

    log.debug(`[skill-selector] Search query: "${ftsQuery}"`)

    const hits = await db.queryHybrid({
        text: ftsQuery,
        k: 20,
        boosts: { name: 4.0, body: 5.0, tags: 3.0 },
    })

    if (hits.length === 0) {
        log.debug(`[skill-selector] No index matches, returning empty array`)
        return []
    }

    log.info(`[skill-selector] Raw scores: ${hits.slice(0, 10).map(r => `id=${r.id}, score=${r.score.toFixed(2)}`).join(", ")}`)

    const relevantResults = hits.filter(r => r.score >= MIN_RELEVANCE_THRESHOLD)
    if (relevantResults.length === 0) {
        log.debug(`[skill-selector] All results below threshold ${MIN_RELEVANCE_THRESHOLD}, returning empty`)
        return []
    }

    const skillMap = new Map(allSkills.map(s => [s.id, s]))
    const scoredSkills: SelectedSkill[] = []

    for (const hit of relevantResults) {
        const skill = skillMap.get(hit.id)
        if (skill) {
            scoredSkills.push({
                id: skill.id,
                name: skill.name,
                score: hit.score,
                category: skill.category,
                description: skill.description || "",
                body: skill.body,
            })
        }
    }

    const topSkills = scoredSkills.slice(0, MAX_SKILLS_PER_TURN)
    const result = topSkills.map(t => toSkillDescriptor(skillMap.get(t.id)!)).filter(Boolean)

    const timing = performance.now() - startTime

    if (result.length > 0) {
        log.info(`[skill-selector] Selected ${result.length} skills in ${timing.toFixed(2)}ms:`,
            result.map(s => ({ name: s.name, category: s.category })))
    } else {
        log.debug(`[skill-selector] No skills selected, returning empty array in ${timing.toFixed(2)}ms`)
    }

    return result
}

// ─── Minimal Skills Loader ───────────────────────────────────────────────────

export async function getMinimalSkills(): Promise<SkillDescriptor[]> {
    try {
        const db = await getHiveDB()
        const skillsCol = db.collection<HiveSkillDoc>("skills")
        const entries = await skillsCol.scan()
        const skills = entries
            .map(e => e.doc)
            .filter(s => s.active && MINIMAL_SKILL_NAMES.has(s.name))
            .map(toSkillDescriptor)

        log.info(`[skill-selector] Loaded ${skills.length} minimal skills: ${skills.map(s => s.name).join(", ")}`)
        return skills
    } catch (err) {
        log.error(`[skill-selector] Failed to load minimal skills:`, err)
        return []
    }
}

// ─── Sync Skills to Index ───────────────────────────────────────────────────

export async function syncSkillsToFTS(): Promise<void> {
    const db = await getHiveDB()

    try {
        const skillsCol = db.collection<HiveSkillDoc>("skills")
        const entries = await skillsCol.scan()
        const dbSkills = entries.map(e => e.doc).filter(s => s.active)

        if (dbSkills.length === 0) {
            log.debug(`[skill-selector] No skills found in DB to sync`)
            return
        }

        const docs: IndexDoc[] = dbSkills.map(skill => ({
            id: skill.id,
            name: skill.name,
            body: `${skill.description || ""} ${skill.body || ""}`,
            tags: [skill.category, ...skill.tools, ...skill.triggers].join(" "),
            filters: [{ field: "type", value: "skill" }],
        }))

        await db.upsertBatch(docs)

        log.info(`[skill-selector] Atomic sync complete: ${dbSkills.length} skills indexed in HiveDB`)

    } catch (err) {
        log.error(`[skill-selector] Transactional sync failed:`, err)
        throw err
    }
}

// ─── Initialization ───────────────────────────────────────────────────────

export function initializeSkillSelector(): void {
    log.info(`[skill-selector] Initializing skill selector (deprecated - sync is done in seed)`)
}

// ─── Debug/Test Helpers ─────────────────────────────────────────────────────

export async function getAllSkillsFromDB(): Promise<SkillDescriptor[]> {
    try {
        const db = await getHiveDB()
        const skillsCol = db.collection<HiveSkillDoc>("skills")
        const entries = await skillsCol.scan()
        return entries.map(e => toSkillDescriptor(e.doc)).filter(s => s.active)
    } catch (err) {
        log.error(`[skill-selector] Failed to fetch skills:`, err)
        return []
    }
}

export async function getSkillByName(name: string): Promise<SkillDescriptor | undefined> {
    try {
        const db = await getHiveDB()
        const skillsCol = db.collection<HiveSkillDoc>("skills")
        const entries = await skillsCol.scan()
        const skill = entries.map(e => e.doc).find(s => s.name === name && s.active)
        return skill ? toSkillDescriptor(skill) : undefined
    } catch (err) {
        log.error(`[skill-selector] Failed to fetch skill by name:`, err)
        return undefined
    }
}

export async function getSkillsByCategory(category: string): Promise<SkillDescriptor[]> {
    try {
        const db = await getHiveDB()
        const skillsCol = db.collection<HiveSkillDoc>("skills")
        const entries = await skillsCol.scan()
        return entries
            .map(e => e.doc)
            .filter(s => s.active && s.category === category)
            .map(toSkillDescriptor)
    } catch (err) {
        log.error(`[skill-selector] Failed to fetch skills by category:`, err)
        return []
    }
}
