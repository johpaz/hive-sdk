/**
 * FTS5-based Dynamic Tool Selector Module
 * 
 * Context Compiler Level 3 - Intelligent Tool Selection
 * 
 * This module intercepts each message BEFORE calling the LLM and uses
 * SQLite FTS5 bm25() scoring to select the most relevant tools (0-4).
 * 
 * DESIGN DECISIONS:
 * 
 * 1. Stateless: No memory between turns - each message is evaluated independently.
 *    Rationale: Prevents cascade effects where a bad selection in one turn affects
 *    future turns. Forces fresh evaluation each time.
 * 
 * 2. Maximum 4 tools per turn: Keeps token count low and prevents overwhelming
 *    the LLM with irrelevant tools. Forces prioritization.
 * 
 * 3. Relevance threshold: If highest bm25 score < MIN_RELEVANCE_THRESHOLD,
 *    the message is considered conversational and returns empty array.
 *    Rationale: Prevents false positives on generic messages like "hola" or
 *    "cómo estás?" which should not trigger any tools.
 * 
 * 4. Atomic over orchestration: When ambiguous, prefer individual tools over
 *    compound/manager tools. Rationale: Atomic tools are more predictable and
 *    the LLM can combine them as needed.
 * 
 * 5. Performance: Must complete in under 50ms. FTS5 queries are typically
 *    <5ms for small tool catalogs (<100 tools).
 * 
 * 6. Tool categorization: Tools are categorized by semantic domain:
 *    - scheduling (cron tools)
 *    - projects (project/task management)
 *    - filesystem (file operations)
 *    - web (search/fetch)
 *    - browser (browser automation)
 *    - memory (notes, memory operations)
 *    - code (exec, terminal)
 *    - canvas (UI rendering)
 *    - agents (agent creation/management)
 *    - core (notify, report_progress, save_note)
 */

import { getHiveDB } from "../../storage/HiveDBStorage.ts"
import { logger } from "../../utils/logger.ts"
import type { HiveDB, IndexDoc } from "@johpaz/hive-db";

const log = logger.child("tool-selector")

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ToolDescriptor {
    name: string
    description: string
    category: string
    /** Abstraction level: atomic (single operation) vs orchestration (manages multiple) */
    abstractionLevel?: "atomic" | "orchestration"
}

export interface SelectedTool {
    name: string
    score: number
    category: string
}

export interface ToolSelectorResult {
    tools: ToolDescriptor[]
    selected: SelectedTool[]
    reasoning: string
    timingMs: number
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Maximum tools to return per message */
const MAX_TOOLS_PER_TURN = 12

/**
 * Minimum bm25 score threshold. Below this = conversational, no tools needed.
 *
 * CRITICAL: bm25() returns NEGATIVE scores where closer to 0 = more relevant.
 * - Score of -5 is MORE relevant than -20
 * - We use -30 as threshold to filter noise while allowing valid matches
 *
 * Previous values: -25 (too strict), -100 (too permissive)
 * New value: -30 (balanced filtering, FTS5 MATCH handles the heavy lifting)
 */
export const MIN_RELEVANCE_THRESHOLD = -30

/** Stopwords to filter out before FTS5 query construction */
const STOPWORDS = new Set([
    "que", "con", "para", "por", "una", "uno", "los", "las", "del",
    "como", "esta", "esto", "ese", "eso", "the", "and", "for",
    "with", "this", "that", "have", "will", "also", "de", "en",
    "el", "la", "se", "su", "sus", "al", "es", "son", "pero",
    "más", "mas", "ya", "yo", "tu", "te", "ti", "mi", "me",
    "hola", "hi", "hello", "hey", "gracias", "thank", "please",
    "ok", "okay", "yes", "si", "no", "bien", "good", "great",
])

/** Conversational patterns that should return empty tool list */
const CONVERSATIONAL_PATTERNS = [
    /^(hola|hi|hello|hey|buenos? días?|buenas? noches?|qué tal|howdy)/i,
    /^(gracias|thank you|thanks|muchas gracias|muchas thanks)/i,
    /^(cómo estás?|how are you?|qué流水|you doing|qué cuentas)/i,
    /^(sí|yes|ok|okay|de acuerdo|perfecto|claro|por supuesto)/i,
    /^(adiós|bye|nos vemos|see you|later|chau)/i,
    /^(entiendo|understand|i see|ya veo|got it)/i,
    /^(bien|good|great|excelente|awesome|perfect)/i,
    /^(?:\?|¿)$/,  // Just a question mark
]

// ─── Tool Catalog ───────────────────────────────────────────────────────────
//
// These 47 tools are the core toolset. Each has:
// - name: unique identifier
// - description: what the tool does (used for FTS5 matching)
// - category: semantic domain for grouping
// - abstractionLevel: atomic (single operation) vs orchestration (manages multiple)
//
// The descriptions are enriched with Spanish/English keywords for better FTS5 matching.

export const CORE_TOOL_CATALOG: ToolDescriptor[] = [
    // Cron tools (cron.*)
    { name: "cron.create", description: "Create new cron job: recurring (cron expression) or one-shot (fire_at). Requires 'task' field with instruction for the agent. Spanish keywords: programar tarea, crear recordatorio, agendar, automatizar horario, tarea recurrente, recordatorio diario, una vez", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.list", description: "List all cron jobs with next execution times and status. Spanish keywords: ver tareas programadas, listar cronograma, próximas ejecuciones, tareas activas, recordatorios pendientes", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.update", description: "Update an existing cron job: change expression, task instruction, channel, time window, etc. Use cron.list first to get task_id. Spanish keywords: actualizar tarea, modificar cron, editar recordatorio, cambiar horario, actualizar programación", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.pause", description: "Pause a cron job temporarily without deleting it. Spanish keywords: pausar tarea programada, detener temporalmente, suspender recordatorio", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.resume", description: "Resume a previously paused cron job. Spanish keywords: reanudar tarea, continuar tarea pausada, activar recordatorio", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.delete", description: "Delete a cron job permanently. Spanish keywords: eliminar tarea programada, borrar recordatorio, cancelar tarea", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.trigger", description: "Manually trigger immediate execution of a cron job now. Spanish keywords: ejecutar tarea ahora, forzar ejecución, disparar manualmente", category: "scheduling", abstractionLevel: "atomic" },
    { name: "cron.history", description: "Get execution history and run logs for a cron job. Spanish keywords: historial ejecuciones, logs tarea, cuándo corrió, registro de ejecuciones", category: "scheduling", abstractionLevel: "atomic" },

    // Project management tools (high-level orchestration)
    { name: "project_create", description: "Create project with tasks, start new project for complex multi-step work. Spanish keywords: crear proyecto, nuevo proyecto, iniciar trabajo, proyecto nuevo, comenzar proyecto", category: "projects", abstractionLevel: "orchestration" },
    { name: "project_list", description: "List all projects with their status. Spanish keywords: listar proyectos, ver proyectos, historial proyectos, todos los proyectos", category: "projects", abstractionLevel: "atomic" },
    { name: "project_update", description: "Update project progress, mark progress percentage and status changes. Spanish keywords: actualizar progreso, marcar avance, estado del proyecto, porcentaje completado", category: "projects", abstractionLevel: "atomic" },
    { name: "project_done", description: "Mark project complete, close finished projects and archive results. Spanish keywords: proyecto terminado, cerrar proyecto, finalizar, proyecto completado, marcar como hecho", category: "projects", abstractionLevel: "atomic" },
    { name: "project_fail", description: "Mark project failed, record failure reason and lessons learned. Spanish keywords: proyecto fallido, error, marcar como fallido, proyecto fracasado, fracaso", category: "projects", abstractionLevel: "atomic" },

    // Task management (atomic)
    { name: "task_create", description: "Add task to project, create subtasks and action items within projects. Spanish keywords: crear tarea, nueva tarea, agregar pendiente, agregar tarea, crear subtarea", category: "projects", abstractionLevel: "atomic" },
    { name: "task_update", description: "Update task status, mark tasks as complete or in progress. Spanish keywords: actualizar tarea, cambiar estado, marcar completa, tarea completada, tarea en progreso", category: "projects", abstractionLevel: "atomic" },
    { name: "task_evaluate", description: "Evaluate task result against acceptance criteria. Spanish keywords: evaluar tarea, validar resultado, criterios aceptación, verificar calidad", category: "projects", abstractionLevel: "atomic" },

    // Code execution
    { name: "cli_exec", description: "Execute shell commands, run bash scripts and system commands. Spanish keywords: ejecutar comando, terminal, línea de comandos, bash, script, comando del sistema", category: "cli", abstractionLevel: "atomic" },

    // Web tools
    { name: "web_search", description: "Search web for current information, find up-to-date news facts and research. Spanish keywords: buscar en internet, buscar web, información, noticias, investigación, buscar", category: "web", abstractionLevel: "atomic" },
    { name: "web_fetch", description: "Fetch content from URL, download and extract content from web pages. Spanish keywords: obtener página, descargar web, extraer contenido, obtener contenido, página web", category: "web", abstractionLevel: "atomic" },
    { name: "api_request", description: "Connect to REST APIs, make HTTP requests with authentication and custom headers. Spanish keywords: conectar api, peticion http, llamada api, rest api, endpoint, bearer token, api key, basic auth", category: "web", abstractionLevel: "atomic" },

    // Memory tools
    { name: "memory_write", description: "Store in long-term memory, save information to persistent memory for later retrieval. Spanish keywords: guardar memoria, guardar información, recordar, guardar dato, memoria", category: "memory", abstractionLevel: "atomic" },
    { name: "memory_read", description: "Retrieve from memory by title, fetch saved information using memory identifier. Spanish keywords: leer memoria, recuperar información, recordar, obtener dato, buscar memoria", category: "memory", abstractionLevel: "atomic" },
    { name: "memory_list", description: "List all memory entries, show all saved memories and stored knowledge. Spanish keywords: listar memorias, ver memorias guardadas, todas las memorias, lista de memorias", category: "memory", abstractionLevel: "atomic" },
    { name: "memory_search", description: "Search memory by content, find memories containing specific keywords. Spanish keywords: buscar en memoria, buscar información guardada, buscar en recuerdos", category: "memory", abstractionLevel: "atomic" },
    { name: "memory_delete", description: "Delete memory entry, remove saved memory from long-term storage. Spanish keywords: borrar memoria, eliminar información guardada, borrar dato, eliminar memoria", category: "memory", abstractionLevel: "atomic" },

    // Agent/worker management
    { name: "agent_create", description: "Create specialized worker agent, spawn new agent for specific task execution. Spanish keywords: crear agente, nuevo agente, trabajador, crear worker, nuevo trabajador", category: "agents", abstractionLevel: "orchestration" },
    { name: "agent_find", description: "Find existing worker agents, locate running or idle worker agents. Spanish keywords: buscar agente, encontrar trabajador, localizar, buscar worker, encontrar agente", category: "agents", abstractionLevel: "atomic" },
    { name: "agent_archive", description: "Archive unnecessary worker, terminate and archive idle or completed agents. Spanish keywords: archivar agente, terminar agente, borrar trabajador, desactivar agente", category: "agents", abstractionLevel: "atomic" },

    // Notes/persistence
    { name: "save_note", description: "Save persistent note to scratchpad, write quick notes and reminders. Spanish keywords: guardar nota, escribir nota, recordatorio rápido, nota rápida, apuntar", category: "core", abstractionLevel: "atomic" },

    // Notifications/reporting
    { name: "notify", description: "Send system notification, alert user with message or alert. Spanish keywords: notificar, enviar notificación, alertar, aviso, alarma", category: "core", abstractionLevel: "atomic" },
    { name: "report_progress", description: "Report progress to user, inform user of current status and completion. Spanish keywords: reportar progreso, informar estado, actualizar,报告进度, progreso", category: "core", abstractionLevel: "atomic" },

    // Browser automation
    { name: "browser_navigate", description: "Navigate to URL and get content, open web pages and extract information. Spanish keywords: navegar web, abrir página, ir a sitio, navegar, ir a página", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_screenshot", description: "Take webpage screenshot, capture visual snapshot of web page. Spanish keywords: captura de pantalla, screenshot, fotografiar página, imagen de página", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_click", description: "Click element on page, interact with buttons and links in browser. Spanish keywords: hacer clic, presionar botón, clickear, pulsar, botón", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_type", description: "Type into input field, fill forms and text inputs in browser. Spanish keywords: escribir en página, llenar formulario, introducir texto, completar formulario", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_extract", description: "Extract text, links, or structured data from page using CSS selectors or XPath. Spanish keywords: extraer datos, obtener información, scraping, selectores, xpath", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_script", description: "Execute arbitrary JavaScript in the browser page context and get the result. Spanish keywords: ejecutar javascript, script, código, función, evaluar, js en página", category: "browser", abstractionLevel: "atomic" },
    { name: "browser_wait", description: "Wait for an element to appear or condition to be met on the page. Spanish keywords: esperar, wait, condición, elemento, selector, aguardar carga", category: "browser", abstractionLevel: "atomic" },

    // Canvas/UI rendering tools
    { name: "canvas_render", description: "Render component on canvas, display UI components and data visualizations. Spanish keywords: renderizar, mostrar en canvas, visualizar, mostrar componente, dibujar", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_ask", description: "Display form and wait for response, show interactive form and collect user input. Spanish keywords: mostrar formulario, pedir datos, solicitar información, formulario interactivo", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_clear", description: "Clear canvas for session, reset canvas display and start fresh. Spanish keywords: limpiar canvas, borrar pantalla, reiniciar, limpiar, borrar", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_show_card", description: "Display card with labeled items, show structured data in card format. Spanish keywords: mostrar tarjeta, visualizar datos, tarjeta de información, mostrar datos", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_show_progress", description: "Display progress bars, show progress indicators and completion status. Spanish keywords: mostrar progreso, barra de progreso, indicador de progreso, avance", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_show_list", description: "Display key-value list, show information in structured list format. Spanish keywords: mostrar lista, listar elementos, lista de valores, mostrar elementos", category: "canvas", abstractionLevel: "atomic" },
    { name: "canvas_confirm", description: "Show confirmation dialog, request user confirmation for actions. Spanish keywords: confirmar, diálogo de confirmación, confirmar acción, validación", category: "canvas", abstractionLevel: "atomic" },

    // A2UI v0.9 rich interactive surfaces
    { name: "a2ui_create_surface", description: "Create A2UI v0.9 surface for rich interactive UIs with forms, dashboards, and workflows. Spanish keywords: crear superficie A2UI, iniciar UI interactiva, crear formulario rico, interfaz A2UI, crear surface", category: "a2ui", abstractionLevel: "orchestration" },
    { name: "a2ui_update_components", description: "Send A2UI v0.9 components to an existing surface (Text, Button, TextField, Row, Column, Card, etc.). Spanish keywords: enviar componentes A2UI, actualizar UI, renderizar componentes, A2UI componentes, update components", category: "a2ui", abstractionLevel: "atomic" },
    { name: "a2ui_update_data_model", description: "Update A2UI v0.9 surface data model with JSON Pointer for dynamic data binding. Spanish keywords: actualizar datos A2UI, poblar formulario, cambiar valores, data model A2UI, actualizar modelo de datos", category: "a2ui", abstractionLevel: "atomic" },
    { name: "a2ui_delete_surface", description: "Delete A2UI v0.9 surface and remove it from the user's canvas. Spanish keywords: eliminar superficie A2UI, borrar UI, limpiar superficie A2UI, cerrar formulario, delete surface", category: "a2ui", abstractionLevel: "atomic" },

    // CodeBridge (subagent process management)
    { name: "codebridge_launch", description: "Launch subagent process, spawn new code bridge agent process. Spanish keywords: lanzar proceso, iniciar subagente, ejecutar código, nuevo proceso", category: "code", abstractionLevel: "orchestration" },
    { name: "codebridge_status", description: "Get status of running subagents, check code bridge agent status. Spanish keywords: estado del proceso, verificar subagente, estado del worker, estado", category: "code", abstractionLevel: "atomic" },
    { name: "codebridge_cancel", description: "Cancel running subagent, terminate code bridge agent process. Spanish keywords: cancelar proceso, terminar subagente, detener proceso, parar", category: "code", abstractionLevel: "atomic" },

    // Voice tools
    { name: "voice_transcribe", description: "Transcribe audio to text, convert speech to written text from audio files. Spanish keywords: transcribir audio, voz a texto, convertir audio, transcripción", category: "voice", abstractionLevel: "atomic" },
    { name: "voice_speak", description: "Convert text to audio and play, synthesize speech from text. Spanish keywords: hablar, sintetizar voz, texto a voz, reproducir audio, voz", category: "voice", abstractionLevel: "atomic" },

    // Filesystem tools
    { name: "fs_read", description: "Read file content from workspace. Spanish keywords: leer archivo, ver contenido, abrir archivo, leer fichero, mostrar archivo", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_write", description: "Create or overwrite file in workspace. Spanish keywords: crear archivo, guardar archivo, escribir archivo, crear fichero, escribir fichero", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_edit", description: "Edit specific lines or sections of a file. Spanish keywords: editar archivo, modificar líneas, actualizar contenido, cambiar archivo", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_delete", description: "Delete file or directory. Spanish keywords: eliminar archivo, borrar archivo, borrar carpeta, eliminar fichero", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_list", description: "List files and directories. Spanish keywords: listar archivos, ver carpeta, explorar directorio, listar ficheros", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_glob", description: "Find files matching wildcard patterns. Spanish keywords: buscar archivos, patrón, encontrar archivos, buscar ficheros", category: "filesystem", abstractionLevel: "atomic" },
    { name: "fs_exists", description: "Check if a file or directory exists. Spanish keywords: verificar archivo, comprobar, existe archivo, comprobar fichero", category: "filesystem", abstractionLevel: "atomic" },

    // Agent delegation and communication
    { name: "task_delegate", description: "Delegate general task to worker agent. Spanish keywords: delegar tarea, asignar worker, ejecutar por agente, encomendar tarea", category: "agents", abstractionLevel: "orchestration" },
    { name: "task_delegate_code", description: "Delegate coding task to CLI subagent (Qwen, Claude Code, Gemini CLI). Spanish keywords: delegar código, subagente CLI, programación, codificar", category: "agents", abstractionLevel: "orchestration" },
    { name: "task_status", description: "Get execution status of delegated tasks. Spanish keywords: estado tarea delegada, verificar progreso, consultar tarea, progreso delegado", category: "agents", abstractionLevel: "atomic" },
    { name: "bus_publish", description: "Publish message to Agent Bus for worker-to-worker communication. Spanish keywords: publicar mensaje, comunicar workers, enviar bus, mensaje bus", category: "agents", abstractionLevel: "atomic" },
    { name: "bus_read", description: "Read unread messages from Agent Bus. Spanish keywords: leer mensajes bus, recibir mensajes, verificar bus, mensajes workers", category: "agents", abstractionLevel: "atomic" },
    { name: "project_updates", description: "Get recent status updates from workers in project. Spanish keywords: actualizaciones proyecto, estado workers, progreso equipo, noticias proyecto", category: "agents", abstractionLevel: "atomic" },
]

// ─── Helper Functions ───────────────────────────────────────────────────────-

/**
 * Check if message is purely conversational (no tools needed)
 * 
 * Uses pattern matching for common conversational phrases.
 * Also checks for very short messages that are likely greetings.
 */
function isConversational(message: string): boolean {
    log.info(`[tool-selector] Checking if message is conversational: "${message}"`)
    const trimmed = message.trim()

    // Empty or very short messages
    if (trimmed.length < 2) return true

    // Check conversational patterns
    for (const pattern of CONVERSATIONAL_PATTERNS) {
        if (pattern.test(trimmed)) {
            log.debug(`[tool-selector] Message matched conversational pattern: ${pattern}`)
            return true
        }
    }

    // Check if all words are stopwords (likely conversational)
    const words = trimmed.toLowerCase().split(/\s+/)
    const meaningfulWords = words.filter(w => w.length > 2 && !STOPWORDS.has(w))
    if (meaningfulWords.length === 0) {
        log.debug(`[tool-selector] All words are stopwords - conversational`)
        return true
    }

    return false
}

/**
 * Build FTS5 query from user message
 * 
 * Strips stopwords, special characters, and limits to 8 keywords.
 * Uses OR operator for flexible matching.
 */
function buildFTSQuery(message: string): string {
    log.info(`[tool-selector] Building FTS query from message: "${message}"`)
    const words = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .slice(0, 8)

    if (words.length === 0) return ""

    // Use prefix matching for better recall (e.g., "gener*" matches "generar", "generando", "generación")
    return words.map(w => `${w}*`).join(" OR ")
}

/**
 * Determine abstraction level preference
 * 
 * Returns 'atomic' to prefer individual tools, 'orchestration' to prefer
 * manager tools. Currently always prefers atomic for better control.
 */
function getAbstractionPreference(): "atomic" | "orchestration" {
    // Prefer atomic tools for more predictable behavior
    return "atomic"
}

// ─── Main Selection Function ─────────────────────────────────────────────────

/**
 * Select tools for a given user message using FTS5 bm25() scoring
 * 
 * @param userMessage - The raw user message
 * @param fullToolList - Full list of available tools (for validation/filtering)
 * @returns Array of 0-4 selected tools with scores
 * 
 * ALGORITHM:
 * 1. If conversational → return []
 * 2. Build FTS5 query from message keywords
 * 3. Query tools_fts with bm25() scoring
 * 4. Filter results below MIN_RELEVANCE_THRESHOLD
 * 5. If ambiguous → prefer atomic over orchestration
 * 6. Return top maxTools results (default: MAX_TOOLS_PER_TURN)
 */
export async function selectTools(
    userMessage: string,
    fullToolList: ToolDescriptor[] = CORE_TOOL_CATALOG,
    maxTools: number = MAX_TOOLS_PER_TURN
): Promise<ToolDescriptor[]> {
    const startTime = performance.now()

    // Log incoming user message for debugging/validation
    log.debug(`[tool-selector] Processing user message: "${userMessage.substring(0, 100)}"`)

    // Step 1: Check if conversational
    if (isConversational(userMessage)) {
        log.debug(`[tool-selector] Conversational message, returning empty array`)
        return []
    }

    // Step 2: Build search query
    const searchQuery = buildFTSQuery(userMessage)
    if (!searchQuery) {
        log.debug(`[tool-selector] No valid query terms, returning empty array`)
        return []
    }

    log.debug(`[tool-selector] Search query: "${searchQuery}"`)

    // Step 3: Execute hybrid search over the HiveDB semantic index
    const db = await getHiveDB()

    // HiveDB text-only BM25 returns positive scores where higher is better.
    const hits = await db.queryHybrid({
        text: searchQuery,
        k: maxTools * 2,
        boosts: { name: 5.0, body: 3.0, tags: 1.0 },
    })

    if (hits.length === 0) {
        log.debug(`[tool-selector] No index matches, returning empty array`)
        return []
    }

    // Log raw scores for debugging
    log.info(`[tool-selector] Raw scores: ${hits.slice(0, 10).map(r => `${r.id}=${r.score.toFixed(2)}`).join(", ")}`)

    // Step 4: Map to tool descriptors with additional metadata
    const toolMap = new Map(fullToolList.map(t => [t.name, t]))

    const scoredTools: SelectedTool[] = []

    for (const hit of hits) {
        const tool = toolMap.get(hit.id)
        if (tool) {
            scoredTools.push({
                name: tool.name,
                score: hit.score,
                category: tool.category,
            })
        }
    }

    // Step 5: Prefer atomic over orchestration when ambiguous
    const abstractionPref = getAbstractionPreference()

    if (scoredTools.length > MAX_TOOLS_PER_TURN) {
        // Sort by score descending (higher HiveDB score = more relevant)
        scoredTools.sort((a, b) => {
            if (Math.abs(a.score - b.score) > 0.1) {
                return b.score - a.score
            }
            const aTool = toolMap.get(a.name)
            const bTool = toolMap.get(b.name)
            const aLevel = aTool?.abstractionLevel ?? "atomic"
            const bLevel = bTool?.abstractionLevel ?? "atomic"

            if (abstractionPref === "atomic") {
                return (aLevel === "atomic" ? -1 : 1)
            } else {
                return (aLevel === "orchestration" ? -1 : 1)
            }
        })
    }

    // Step 6: Take top N tools
    const topTools = scoredTools.slice(0, maxTools)

    // Step 7: Return as ToolDescriptor array
    const result = topTools.map(t => toolMap.get(t.name)!).filter(Boolean)

    const timing = performance.now() - startTime

    if (result.length > 0) {
        log.info(`[tool-selector] Selected ${result.length} tools in ${timing.toFixed(2)}ms:`,
            result.map(t => ({ name: t.name, category: t.category })))
    } else {
        log.debug(`[tool-selector] No tools selected, returning empty array in ${timing.toFixed(2)}ms`)
    }

    return result
}

// ─── Sync Tools to FTS5 ─────────────────────────────────────────────────────

/**
 * Sync tool catalog to FTS5 virtual table
 *
 * Called on initialization from gateway/initializer.ts to populate the FTS5 index.
 * Assumes the tools_fts table already exists (created by CONTEXT_ENGINE_SCHEMA).
 * Descriptions are enriched with bilingual keywords for better matching.
 *
 * @param tools - Optional array of tools to sync. If not provided, fetches from DB.
 */
export async function syncToolCatalogToFTS(tools?: ToolDescriptor[]): Promise<void> {
    const db = await getHiveDB()

    try {
        // Step 1: Build full catalog = CORE_TOOL_CATALOG + any explicitly passed tools
        const catalogByName = new Map<string, ToolDescriptor>(
            CORE_TOOL_CATALOG.map(t => [t.name, t])
        )

        // Merge in any tools persisted in HiveDB that are missing from the static catalog
        const toolsCol = db.collection<ToolDescriptor>("tools")
        const dbTools = await toolsCol.scan()
        for (const entry of dbTools) {
            const row = entry.doc
            if (!catalogByName.has(row.name)) {
                catalogByName.set(row.name, {
                    name: row.name,
                    description: row.description ?? row.name,
                    category: row.category ?? "core",
                    abstractionLevel: row.abstractionLevel ?? "atomic",
                })
            }
        }

        for (const t of (tools || [])) {
            if (!catalogByName.has(t.name)) {
                catalogByName.set(t.name, t)
            }
        }

        const toolCatalog = Array.from(catalogByName.values())

        // Step 2: Build index documents and upsert atomically via batch
        const docs: IndexDoc[] = toolCatalog.map(tool => ({
            id: tool.name,
            name: tool.name,
            body: enrichToolDescription(tool),
            tags: tool.category,
            filters: [{ field: "type", value: "tool" }],
        }))

        await db.clearIndex()
        await db.upsertBatch(docs)

        log.info(`[tool-selector] Atomic sync complete: ${toolCatalog.length} tools indexed in HiveDB`)

    } catch (err) {
        log.error(`[tool-selector] Transactional sync failed:`, err)
        throw err
    }
}

/**
 * Enrich tool description with category-specific keywords
 * 
 * This improves FTS5 matching for both English and Spanish queries.
 */
export function enrichToolDescription(tool: ToolDescriptor): string {
    const keywordsByCategory: Record<string, string> = {
        scheduling: "programar recordatorio alarma cron schedule reminder task future tiempo",
        projects: "proyecto tarea plan organizer milestone backlog sprint work",
        filesystem: "archivo file leer escribir editar documento content source code",
        web: "buscar internet google web search find information news research",
        browser: "navegador browser click screenshot form automation web page UI",
        memory: "recordar nota guardar memory store remember persist knowledge",
        code: "code ejecutar run script bash shell terminal command devops",
        canvas: "canvas diagram visualization graph node edge flow chart",
        agents: "agente worker specialist create delegate hire team manager",
        core: "notificar message alert notify communicate progress status",
        voice: "voz audio transcribir speech speak sintetizar audio voice transcription",
    }

    const extra = keywordsByCategory[tool.category] ?? ""
    return `${tool.description} ${extra}`
}

// ─── Initialization ─────────────────────────────────────────────────────────

/**
 * Sanitize an MCP tool name to comply with LLM function-name rules.
 *
 * Gemini (and OpenAI) require: start with letter/underscore, only [a-zA-Z0-9_.-:], max 64 chars.
 * Server names from the UI can contain spaces and special chars (e.g. "X antes twiter").
 *
 * Canonical format: `{safeServer}__{safeTool}` (double underscore as separator)
 */
export function mcpToolFullName(serverName: string, toolName: string): string {
    const safe = (s: string) => s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-:]/g, '_')
    const full = `${safe(serverName)}__${safe(toolName)}`
    // Ensure starts with letter/underscore and fits within 64 chars
    const trimmed = full.length > 64 ? full.substring(0, 64) : full
    return /^[a-zA-Z_]/.test(trimmed) ? trimmed : `_${trimmed}`.substring(0, 64)
}

/**
 * Initialize the tool selector
 *
 * DEPRECATED: syncToolCatalogToFTS() is now called from gateway/initializer.ts
 * This function is kept for backward compatibility but is no longer needed
 */
export function initializeToolSelector(): void {
    log.info(`[tool-selector] Initializing (deprecated - sync is done in gateway/initializer.ts)`)
    // syncToolCatalogToFTS() - No longer needed here, done in gateway/initializer.ts
}

// ─── Debug/Test Helpers ─────────────────────────────────────────────────────

/**
 * Get all tools (for debugging/testing)
 */
export function getAllTools(): ToolDescriptor[] {
    return [...CORE_TOOL_CATALOG]
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolDescriptor | undefined {
    return CORE_TOOL_CATALOG.find(t => t.name === name)
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): ToolDescriptor[] {
    return CORE_TOOL_CATALOG.filter(t => t.category === category)
}
