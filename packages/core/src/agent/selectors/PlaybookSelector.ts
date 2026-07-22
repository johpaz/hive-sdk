/**
 * HiveDB-based Playbook Rules Selector (ACE Curator)
 *
 * Uses HiveDB hybrid search over the playbook index.
 */

import { getHiveDB } from "../../storage/HiveDBStorage.ts"
import { logger } from "../../utils/logger.ts"
import type { HivePlaybookDoc } from "../../storage/hiveSeed.ts"
import type { IndexDoc } from "@johpaz/hive-db"

const log = logger.child("playbook-selector")

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface PlaybookRule {
    id: string
    rule: string
    category: string
    applicable_to?: string
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const MAX_RULES_PER_TURN = 5

const MIN_RELEVANCE_THRESHOLD = 0.5

// ─── Selection Logic ───────────────────────────────────────────────────────────

function toRule(id: string, doc: HivePlaybookDoc): PlaybookRule {
    return {
        id,
        rule: doc.rule,
        category: doc.category,
        applicable_to: doc.applicableTo ? doc.applicableTo.join(",") : undefined,
    }
}

export async function selectPlaybookRules(message: string): Promise<PlaybookRule[]> {
    const db = await getHiveDB()
    const startTime = performance.now()

    const keywords = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5)

    if (keywords.length === 0) return []

    const query = keywords.join(" ")

    try {
        const hits = await db.queryHybrid({
            text: query,
            k: MAX_RULES_PER_TURN,
            boosts: { body: 5.0, tags: 2.0, name: 1.0 },
        })

        const relevantIds = hits
            .filter(r => r.score >= MIN_RELEVANCE_THRESHOLD)
            .map(r => r.id)

        if (relevantIds.length === 0) return []

        const playbookCol = db.collection<HivePlaybookDoc>("playbook")
        const rules: PlaybookRule[] = []
        for (const id of relevantIds) {
            const entry = await playbookCol.get(id)
            if (entry && entry.doc.active) {
                rules.push(toRule(id, entry.doc))
            }
        }

        const timing = performance.now() - startTime
        log.info(`[playbook-selector] Selected ${rules.length} rules in ${timing.toFixed(2)}ms`)
        if (rules.length > 0) {
          log.debug(`[playbook-selector] Rules: ${rules.map(r => `[${r.id}] ${r.rule.substring(0, 60)}`).join(', ')}`)
        }

        return rules
    } catch (err) {
        log.error(`[playbook-selector] Failed to select rules:`, err)
        return []
    }
}

// ─── Sync Logic ───────────────────────────────────────────────────────────────

export async function syncPlaybookToFTS(): Promise<void> {
    const db = await getHiveDB()

    try {
        const playbookCol = db.collection<HivePlaybookDoc>("playbook")
        const entries = await playbookCol.scan()
        const rules = entries.map(e => ({ id: e.id, doc: e.doc })).filter(r => r.doc.active)

        if (rules.length === 0) {
            log.debug(`[playbook-selector] No rules in playbook to sync`)
            return
        }

        const docs: IndexDoc[] = rules.map(r => ({
            id: r.id,
            name: r.doc.category,
            body: r.doc.rule,
            tags: r.doc.applicableTo ? r.doc.applicableTo.join(" ") : "",
            filters: [{ field: "type", value: "playbook" }],
        }))

        await db.upsertBatch(docs)

        log.info(`[playbook-selector] Atomic sync complete: ${rules.length} rules indexed in HiveDB`)

    } catch (err) {
        log.error(`[playbook-selector] Transactional sync failed:`, err)
        throw err
    }
}
