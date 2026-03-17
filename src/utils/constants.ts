export const APP_NAME = "TS-League 野手成績自動反映ツール";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

export const PLAYWRIGHT_TIMEOUT_MS = 20_000;
export const PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = 30_000;
export const JOB_POLL_INTERVAL_MS = 2_000;

export const JOB_LIST_LIMIT = 20;

export const BATTER_STAT_FIELDS = [
  "playerName",
  "battingOrder",
  "position",
  "plateAppearances",
  "atBats",
  "runs",
  "hits",
  "rbi",
  "doubles",
  "triples",
  "homeRuns",
  "walks",
  "hitByPitch",
  "strikeouts",
  "sacrificeBunts",
  "sacrificeFlies",
  "stolenBases",
  "errors",
] as const;

export type BatterStatField = (typeof BATTER_STAT_FIELDS)[number];

export const NAME_HEADER_ALIASES = ["選手", "選手名", "氏名", "名前", "player", "打者"];

export const BATTER_HEADER_ALIASES: Record<BatterStatField, string[]> = {
  playerName: NAME_HEADER_ALIASES,
  battingOrder: ["打順", "順", "order", "batting order"],
  position: ["守備", "位置", "pos", "position"],
  plateAppearances: ["打席", "pa", "plate appearances", "plate appearance"],
  atBats: ["打数", "ab", "at bats", "at bat"],
  runs: ["得点", "run", "runs", "r"],
  hits: ["安打", "hit", "hits", "h"],
  rbi: ["打点", "rbi"],
  doubles: ["2塁打", "二塁打", "2b", "double", "doubles"],
  triples: ["3塁打", "三塁打", "3b", "triple", "triples"],
  homeRuns: ["本塁打", "hr", "home run", "homerun", "home runs"],
  walks: ["四球", "bb", "walk", "walks"],
  hitByPitch: ["死球", "hbp", "hit by pitch"],
  strikeouts: ["三振", "so", "k", "strikeout", "strikeouts"],
  sacrificeBunts: ["犠打", "犠", "sac bunt", "sacrifice bunt", "bunt"],
  sacrificeFlies: ["犠飛", "sac fly", "sacrifice fly"],
  stolenBases: ["盗塁", "sb", "steal", "stolen base", "stolen bases"],
  errors: ["失策", "e", "error", "errors"],
};

export const PITCHER_ONLY_HEADER_ALIASES = [
  "投手",
  "回",
  "球数",
  "被安打",
  "失点",
  "自責",
  "四球数",
  "奪三振率",
];

export const ORDER_MADE_LOGIN_SELECTORS = [
  'form[action="https://ordermade.sakura.ne.jp/kanri/login"]',
  'form[action="/kanri/login"]',
];

export const TS_LEAGUE_LOGIN_SELECTORS = [
  'form[action="../../pass/pass_check.php"]',
  'form[action*="pass_check.php"]',
];

export const TARGET_GAME_LINK_SELECTORS = [
  "a",
  'input[type="submit"]',
  'button[type="submit"]',
];

export const APP_BASIC_AUTH_REALM = "TS-League 野手成績自動反映ツール";
