export interface EthicsRule {
	id: number;
	rule: string;
	category: string;
	applicable_to: string;
	helpful_count: number;
	active: number;
}

export class EthicsGuard {
	private db: any;

	constructor(db: any) {
		this.db = db;
	}

	getRules(agentRole?: string): EthicsRule[] {
		if (!agentRole) {
			return this.db
				.query(
					`SELECT p.* FROM playbook p
           WHERE p.category = 'response_quality' AND p.active = 1
           ORDER BY p.helpful_count DESC`
				)
				.all() as EthicsRule[];
		}

		try {
			const ftsRows = this.db
				.query(
					`SELECT p.* FROM playbook p
           JOIN playbook_fts fts ON p.rowid = fts.rowid
           WHERE fts.playbook_fts MATCH ?
           AND p.category = 'response_quality' AND p.active = 1
         ORDER BY p.helpful_count DESC`,
					[agentRole]
				)
				.all() as EthicsRule[];

			if (ftsRows.length > 0) return ftsRows;
		} catch {}

		return this.db
			.query(
				`SELECT * FROM playbook
         WHERE category = 'response_quality' AND active = 1
         ORDER BY helpful_count DESC`
			)
			.all() as EthicsRule[];
	}

	injectIntoPrompt(systemPrompt: string, rules: EthicsRule[]): string {
		if (rules.length === 0) return systemPrompt;
		const ethicsSection = rules
			.map(r => `- ${r.rule}`)
			.join("\n");
		return `${systemPrompt}\n\n## Reglas de Calidad de Respuesta\n${ethicsSection}`;
	}

	hasEthicsLayer(): boolean {
		const count = this.db
			.query(`SELECT COUNT(*) as c FROM playbook WHERE category = 'response_quality' AND active = 1`)
			.get() as any;
		return (count?.c ?? 0) > 0;
	}
}
