# SkillAuditor — Deployed Contract Addresses

## Base Sepolia (chain ID 84532)

| Contract | Address | Basescan |
|----------|---------|---------|
| **SkillRegistry** | `0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc` | [View](https://sepolia.basescan.org/address/0x87c3e6c452585806ef603a9501eb74ce740cafcc) |

**Deployer / Owner:** `0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab`  
**AuditorAgent (current):** `0xD9303DFc71728f209EF64DD1AD97F5a557AE0Fab` — rotate to CDP AgentKit wallet in prod

---

## Ethereum Sepolia (chain ID 11155111)

| Contract | Address | Etherscan |
|----------|---------|---------|
| **SkillSubnameRegistrar** | `0xd68f99d601155e7ca79327010dfd2636e6157b5f` | [View](https://sepolia.etherscan.io/address/0xd68f99d601155e7ca79327010dfd2636e6157b5f) |
| ~~SkillSubnameRegistrar v1~~ | ~~`0x83466a77A8EeE107083876a311EC0700c3cC8453`~~ | superseded |

**ENS name:** `skillauditor.eth` (registered 2026-04-04, owner: deployer)  
**ENS subnode:** `skills.skillauditor.eth` (owned by SkillSubnameRegistrar v2)  
**ENS root node:** `0xe5059865a0a7f7f9710248d1d21377b568f956f407f5921083095772491a05d4`  
**Skill subnames pattern:** `{skillname-slug}-{hash8}.skills.skillauditor.eth`  
**Text records:** `verdict`, `score`, `report_cid`, `audited_at`, `auditor`, `skill_name`, `skill_hash`, `audit_id`, `base_tx_hash`

---

## Base Mainnet (chain ID 8453)

_Not yet deployed — post-hackathon (will use Basenames / L2 ENS)._

---

## Deployment log

| Date | Network | Contract | Tx |
|------|---------|----------|-----|
| 2026-04-04 | Base Sepolia | SkillRegistry `0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc` | [broadcast](contracts/broadcast/Deploy.s.sol/84532/run-latest.json) |
| 2026-04-04 | Ethereum Sepolia | SkillSubnameRegistrar `0x83466a77A8EeE107083876a311EC0700c3cC8453` | [broadcast](contracts/broadcast/Deploy.s.sol/11155111/run-latest.json) |
| 2026-04-04 | Ethereum Sepolia | ENS: registered `skillauditor.eth` | tx `0x34f3e5bd9a61452d3b76c2b24fd540d3087d1a4b7e7458fc1fa98ac34f4f2bc5` |
| 2026-04-04 | Ethereum Sepolia | ENS: created `skills.skillauditor.eth`, transferred to registrar | tx `0x86a15361c218235b1b69b0b85d3a12dc43f886181cf5876220b877cd1ef82f5e` |
| 2026-04-05 | Ethereum Sepolia | SkillSubnameRegistrar v2 `0xd68f99d601155e7ca79327010dfd2636e6157b5f` (slug labels + audit_id/base_tx_hash text records) | tx `0xbd784b56a4bb8e41092e10ea92d0ad444f68efa30ae0b7f0ca037c1f976fc514` |
| 2026-04-05 | Ethereum Sepolia | ENS: transferred `skills.skillauditor.eth` ownership to v2 registrar | tx `0x6667f39360c6e5de2490d8308e4278e8bd56dcc1742576733f4c656a09df0fa0` |
