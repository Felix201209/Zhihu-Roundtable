import type { HackathonReadinessReport, HackathonRubricItem, RoundtableSnapshot } from "../core/types.js";

const WEIGHTS: HackathonRubricItem[] = [
  { key: "ai_value", label: "AI 场景价值", weight: 35, score: 0, reasons: [], risks: [] },
  { key: "innovation", label: "创新度", weight: 25, score: 0, reasons: [], risks: [] },
  { key: "completion", label: "完成度", weight: 25, score: 0, reasons: [], risks: [] },
  { key: "ux", label: "产品体验与设计感", weight: 8, score: 0, reasons: [], risks: [] },
  { key: "pitch", label: "计划书和演示环节", weight: 7, score: 0, reasons: [], risks: [] },
];

export function buildReadinessReport(snapshot: RoundtableSnapshot): HackathonReadinessReport {
  const hasEvidence = snapshot.evidence.length >= 3;
  const hasDebate = snapshot.turns.length >= 4;
  const hasPublish = Boolean(snapshot.publishDraft);
  const hasFeedback = Boolean(snapshot.commentInsight);
  const hasModels = (snapshot.modelUsages ?? []).length >= 7;
  const hasNodes = (snapshot.nodeResults ?? []).length >= 10;
  const hasLiu = snapshot.turns.some((turn) => turn.speaker === "liu");
  const hasDisputes = (snapshot.viewpointMap?.disputes.length ?? 0) > 0;

  const items = WEIGHTS.map((item): HackathonRubricItem => {
    if (item.key === "ai_value") {
      const score = completionRatio([hasEvidence, hasDebate, hasPublish, hasFeedback, hasModels]);
      return {
        ...item,
        score,
        reasons: ["完成度检查：热榜、证据约束、讨论方案、发布预览、评论复盘数据已接入。"],
        risks: ["分数只代表演示链路证据是否齐备，不代表真实讨论质量已经被自动证明。"],
      };
    }

    if (item.key === "innovation") {
      const score = completionRatio([hasLiu, hasDisputes, hasFeedback, hasNodes]);
      return {
        ...item,
        score,
        reasons: ["不是 AI 写回答或摘要，而是面向创作者和圈主的社区讨论组织台。"],
        risks: hasLiu ? ["还需要现场展示刘看山如何控场、追问、降温和发现下一轮选题。"] : ["刘看山主持人格需要在 UI 中更强。"],
      };
    }

    if (item.key === "completion") {
      const score = completionRatio([snapshot.stage === "feedback", hasEvidence, hasDebate, hasPublish, hasFeedback, hasNodes]);
      return {
        ...item,
        score,
        reasons: ["后端可一键跑完整流程，也支持分步 endpoint 和 SSE。"],
        risks: score < 95 ? ["需要继续减少人工演示步骤。"] : [],
      };
    }

    if (item.key === "ux") {
      const score = completionRatio([hasNodes, hasModels, Boolean(snapshot.stancePreview), Boolean(snapshot.titleOptions?.length)]);
      return {
        ...item,
        score,
        reasons: ["第一屏已收敛为知辩圆桌双入口，热榜讨论方案为主线，技术细节后置但可展开验证。"],
        risks: ["最终得分仍依赖现场投屏清晰度和讲解节奏。"],
      };
    }

    const score = completionRatio([hasPublish, hasFeedback, hasNodes, hasModels]);
    return {
      ...item,
      score,
      reasons: ["后端输出可直接支持 6 分钟路演：节点、模型、发布、回流都有证据。"],
      risks: ["需要准备固定话术和缓存案例，避免现场乱选题。"],
    };
  });

  return {
    totalScore: Math.round(items.reduce((sum, item) => sum + (item.score * item.weight) / 100, 0)),
    awardTargets: ["综合大奖", "生态共振奖", "极致交付奖"],
    items,
    strongestProof: [
      "热点进入到圈子讨论方案再到评论复盘的社区型 AI 闭环",
      "Kimi/DeepSeek V4 国内模型角色分工和 JSON schema 校验",
      "所有关键步骤都有 nodeResults 和 modelUsages 可视化证据",
      "第一屏明确主 CTA：从热榜生成讨论方案，想法试验场作为副入口",
    ],
    missingProof: [
      "真实知乎 API token 下的 live 请求录像或日志",
      "正式刘看山官方素材授权后的替换截图",
      "真实评论回流后，新争议进入下一轮创作方向的现场录像",
    ],
    demoChecklist: [
      "打开首页 5 秒内说明：不是写回答/摘要，是创作者讨论组织台",
      "选择热榜话题并展示讨论潜力评分",
      "展示证据来源和 stancePreview",
      "展示刘看山如何校验讨论方案、站队空间和证据来源",
      "生成圈子帖、站队选项和引导评论，并强调用户确认",
      "展示评论复盘和下一篇内容方向",
    ],
  };
}

function completionRatio(checks: boolean[]): number {
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
