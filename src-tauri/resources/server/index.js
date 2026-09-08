import { createRequire as __cr } from 'module';const require=__cr(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/index.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";

// src/ws/hub.ts
var clients = /* @__PURE__ */ new Set();
var cancelHandlers = /* @__PURE__ */ new Map();
function addClient(ws) {
  clients.add(ws);
  ws.on("message", (raw3) => {
    try {
      const msg = JSON.parse(raw3.toString());
      if (msg.type === "cancel" && msg.jobId) {
        const handler = cancelHandlers.get(msg.jobId);
        if (handler) {
          handler();
        }
      }
    } catch {
    }
  });
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
}
function publish(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
function registerCancel(jobId, handler) {
  cancelHandlers.set(jobId, handler);
}
function unregisterCancel(jobId) {
  cancelHandlers.delete(jobId);
}

// generated/prisma/client.ts
import * as path from "path";
import { fileURLToPath } from "url";

// generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "sqlite",
  "inlineSchema": '// Prisma 7 schema\uFF08SQLite\uFF09\u3002URL \u5728 prisma.config.ts \u63D0\u4F9B\uFF0C\u6B64\u5904\u4E0D\u518D\u542B url\u3002\n// SQLite \u65E0\u539F\u751F\u679A\u4E3E -> \u72B6\u6001/\u7C7B\u578B\u7528 String + \u5E94\u7528\u5C42\u5E38\u91CF\uFF1B\u6570\u7EC4\u7528 Json\u3002\n\ngenerator client {\n  provider = "prisma-client"\n  output   = "../generated/prisma"\n}\n\ndatasource db {\n  provider = "sqlite"\n}\n\nmodel Project {\n  id           String        @id @default(cuid())\n  name         String\n  baseUrl      String?\n  /// \u9879\u76EE\u9009\u7528\u7684\u7EC4\u4EF6\u63D2\u4EF6\u9884\u8BBE\uFF08\u7EC4\u5408\u5373\u5F00\u5173\uFF09\uFF1B\u5220\u9664\u9884\u8BBE\u65F6\u7F6E\u7A7A\uFF0C\u56DE\u843D\u5168\u90E8\u63D2\u4EF6\u6309 builtin\u2192upload \u6CE8\u5165\u3002\n  presetId     String?\n  preset       PluginPreset? @relation(fields: [presetId], references: [id], onDelete: SetNull)\n  /// \u9879\u76EE\u7EA7\u6D4F\u89C8\u5668\u7A97\u53E3\u5C3A\u5BF8 {width, height}\uFF08\u8FD0\u884C/\u751F\u6210\u811A\u672C\u542F\u52A8\u6D4F\u89C8\u5668\u65F6\u751F\u6548\uFF09\uFF1Bnull = \u9ED8\u8BA4 1920\xD71080\u3002\n  viewport     Json?\n  createdAt    DateTime      @default(now())\n  updatedAt    DateTime      @updatedAt\n  testCases    TestCase[]\n  envVars      EnvVar[]\n  loginConfigs LoginConfig[]\n}\n\n/// \u9879\u76EE\u7EA7\u73AF\u5883\u53D8\u91CF\uFF1A\u811A\u672C\u4E2D {{key}} \u5360\u4F4D\u7B26\u5728\u8FD0\u884C\u65F6\u66FF\u6362\u4E3A\u5176 value\u3002\nmodel EnvVar {\n  id        String   @id @default(cuid())\n  projectId String\n  key       String\n  value     String\n  createdAt DateTime @default(now())\n  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)\n\n  @@unique([projectId, key])\n  @@index([projectId])\n}\n\n/// \u9879\u76EE\u7EA7\u767B\u5F55\u914D\u7F6E\uFF1A\u5F55\u5236\u767B\u5F55\u540E\u7684\u6D4F\u89C8\u5668\u72B6\u6001\uFF08Cookie + localStorage\uFF09\uFF0C\u8FD0\u884C\u811A\u672C\u65F6\u6309\u9009\u5B9A\u914D\u7F6E\u4EE5\u5DF2\u767B\u5F55\u72B6\u6001\u542F\u52A8\u6D4F\u89C8\u5668\u3002\nmodel LoginConfig {\n  id           String   @id @default(cuid())\n  projectId    String\n  name         String\n  storageState Json\n  isDefault    Boolean  @default(false)\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)\n\n  @@index([projectId])\n}\n\nmodel TestCase {\n  id              String          @id @default(cuid())\n  projectId       String\n  title           String\n  description     String?\n  naturalLanguage String?\n  status          String          @default("DRAFT")\n  sortOrder       Int             @default(0)\n  /// \u6279\u91CF\u8FD0\u884C\u9ED8\u8BA4\u4F7F\u7528\u7684\u811A\u672C\u7248\u672C\uFF08\u7528\u4F8B\u5217\u8868\u300C\u6279\u91CF\u7248\u672C\u300D\u5217\u9009\u62E9\u540E\u4FDD\u5B58\uFF1B\u672A\u8BBE\u7F6E\u65F6\u53D6\u6700\u65B0\uFF09\u3002\n  defaultScriptId String?\n  defaultScript   TestScript?     @relation("DefaultScript", fields: [defaultScriptId], references: [id], onDelete: SetNull)\n  createdAt       DateTime        @default(now())\n  updatedAt       DateTime        @updatedAt\n  project         Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)\n  scripts         TestScript[]\n  runs            TestRun[]\n  generationLogs  GenerationLog[]\n\n  @@index([projectId])\n}\n\nmodel TestScript {\n  id         String     @id @default(cuid())\n  testCaseId String\n  version    Int        @default(1)\n  steps      Json\n  rawCode    String?\n  createdAt  DateTime   @default(now())\n  testCase   TestCase   @relation(fields: [testCaseId], references: [id], onDelete: Cascade)\n  /// \u88AB\u5404\u7528\u4F8B\u9009\u4E3A\u6279\u91CF\u9ED8\u8BA4\u7248\u672C\u7684\u5F15\u7528\uFF08\u53CD\u5411\uFF09\u3002\n  defaultFor TestCase[] @relation("DefaultScript")\n  runs       TestRun[]\n\n  @@unique([testCaseId, version])\n  @@index([testCaseId])\n}\n\nmodel TestRun {\n  id          String       @id @default(cuid())\n  testCaseId  String\n  scriptId    String?\n  status      String       @default("PENDING")\n  startedAt   DateTime?\n  finishedAt  DateTime?\n  logs        String?\n  meta        Json?\n  createdAt   DateTime     @default(now())\n  testCase    TestCase     @relation(fields: [testCaseId], references: [id], onDelete: Cascade)\n  script      TestScript?  @relation(fields: [scriptId], references: [id], onDelete: SetNull)\n  stepResults StepResult[]\n\n  @@index([testCaseId])\n}\n\nmodel StepResult {\n  id            String   @id @default(cuid())\n  runId         String\n  stepIndex     Int\n  action        String\n  status        String   @default("PENDING")\n  message       String?\n  durationMs    Int?\n  screenshot    String?\n  consoleLog    String?\n  networkLog    String?\n  healed        Boolean  @default(false)\n  /// \u81EA\u6108\u627E\u5230\u7684\u65B0\u5B9A\u4F4D\u5668\uFF08act/observe \u8FD4\u56DE\u7684 selector \u8F6C Locator\uFF09\u3002\u91C7\u7EB3\u65F6\u8986\u76D6\u56DE\u539F\u811A\u672C\u3002\n  healedLocator Json?\n  createdAt     DateTime @default(now())\n  run           TestRun  @relation(fields: [runId], references: [id], onDelete: Cascade)\n\n  @@index([runId])\n}\n\n/// \u751F\u6210\u811A\u672C\u6D41\u7A0B\u7684\u4E00\u6B21\u4F1A\u8BDD\uFF1A\u5173\u8054 jobId\uFF0C\u8BB0\u5F55\u7528\u6237\u8F93\u5165/\u6700\u7EC8\u72B6\u6001/\u603B token \u7528\u91CF\u4E0E\u6700\u7EC8\u6B65\u9AA4\u3002\nmodel GenerationLog {\n  id          String           @id @default(cuid())\n  jobId       String           @unique\n  projectId   String?\n  testCaseId  String?\n  status      String           @default("RUNNING") // RUNNING | DONE | ERROR | CANCELLED | PAUSED\n  nl          String\n  startUrl    String?\n  finishedAt  DateTime?\n  totalUsage  Json?\n  scriptSteps Json?\n  error       String?\n  /// \u6682\u505C\u65F6\u7684\u5FAA\u73AF\u72B6\u6001\u5FEB\u7167\uFF08messages + \u5927\u7EB2 + \u76EE\u6807\u6587\u672C\uFF09\uFF0C\u4F9B\u300C\u7EE7\u7EED\u751F\u6210\u300D\u8BFB\u56DE\u7EED\u8DD1\u3002\n  loopState   Json?\n  createdAt   DateTime         @default(now())\n  updatedAt   DateTime         @updatedAt\n  steps       GenerationStep[]\n  testCase    TestCase?        @relation(fields: [testCaseId], references: [id], onDelete: SetNull)\n\n  @@index([testCaseId])\n  @@index([projectId])\n  @@index([createdAt])\n}\n\n/// \u751F\u6210\u811A\u672C\u6D41\u7A0B\u4E2D\u7684\u4E00\u4E2A\u4E8B\u4EF6\u6216 LLM \u8C03\u7528\uFF1Aplan/aifix/vision/tool/status/assist/revoke \u7B49\u3002\nmodel GenerationStep {\n  id        String        @id @default(cuid())\n  logId     String\n  type      String // user_input | plan | aifix | vision | tool | status | plan_confirmed | revoke | assist | done | error\n  stepIndex Int?\n  message   String?\n  system    String? // LLM system prompt\n  user      String? // LLM user content\n  assistant String? // LLM assistant content\n  tool      String? // \u5DE5\u5177\u540D\uFF08observe/act/aiFix \u7B49\uFF09\n  args      Json? // \u8C03\u7528\u53C2\u6570\n  result    String? // \u5DE5\u5177\u7ED3\u679C\uFF08\u622A\u65AD\uFF09\n  error     String? // \u9519\u8BEF\u4FE1\u606F\n  usage     Json? // \u672C\u6B65 TokenUsage\n  createdAt DateTime      @default(now())\n  log       GenerationLog @relation(fields: [logId], references: [id], onDelete: Cascade)\n\n  @@index([logId, createdAt])\n}\n\n/// \u7EC4\u4EF6\u9002\u914D\u63D2\u4EF6\uFF1A\u9875\u5185\u811A\u672C\uFF08detect/candidates/annotate/actions \u56DB\u63D2\u69FD\uFF09\uFF0C\u6CE8\u5165\u88AB\u6D4B\u9875\u9762\u3002\n/// \u6CE8\u5165\u8303\u56F4\u7531 PluginPreset \u7F16\u6392\uFF08\u7EC4\u5408\u5373\u5F00\u5173\uFF09\uFF0C\u672C\u8868\u4E0D\u8BBE\u542F\u7528\u5F00\u5173\u3002\nmodel Plugin {\n  id          String             @id @default(cuid())\n  name        String             @unique\n  version     String             @default("1.0.0")\n  description String?\n  kind        String             @default("inpage")\n  /// \u5165\u53E3 js \u6E90\u7801\uFF08\u88F8 .js \u76F4\u4F20\u6216 zip \u89E3\u5305\u6240\u5F97\uFF09\u3002\n  entryFile   String\n  source      String             @default("upload") // builtin | upload\n  builtin     Boolean            @default(false)\n  /// \u52A8\u4F5C\u5143\u6570\u636E [{name, doc, preferFill}]\uFF1A\u5185\u7F6E\u63D2\u4EF6\u968F\u5B9A\u4E49\u7EF4\u62A4\uFF1B\u7528\u6237\u63D2\u4EF6\u5728\u8BD5\u8FD0\u884C\u540E\u56DE\u5199\u3002\n  actions     Json?\n  createdAt   DateTime           @default(now())\n  updatedAt   DateTime           @updatedAt\n  presets     PluginPresetItem[]\n\n  @@index([source])\n}\n\n/// \u63D2\u4EF6\u9884\u8BBE\uFF1A\u4E00\u7EC4\u6709\u5E8F\u63D2\u4EF6\uFF08\u6210\u5458\u987A\u5E8F\u5373\u6CE8\u5165\u4F18\u5148\u7EA7\uFF09\uFF1B\u6BCF\u4E2A\u9879\u76EE\u5173\u8054\u4E00\u4E2A preset\u3002\nmodel PluginPreset {\n  id          String             @id @default(cuid())\n  name        String             @unique\n  description String?\n  builtin     Boolean            @default(false)\n  createdAt   DateTime           @default(now())\n  updatedAt   DateTime           @updatedAt\n  items       PluginPresetItem[]\n  projects    Project[]\n}\n\nmodel PluginPresetItem {\n  id       String       @id @default(cuid())\n  presetId String\n  pluginId String\n  /// \u6CE8\u5165\u987A\u5E8F\u4E3A\u5347\u5E8F\uFF08\u8D8A\u5C0F\u8D8A\u5148\u6CE8\u5165\uFF09\uFF1B\u7F16\u8F91\u62BD\u5C49\u5C55\u793A\u7684\u987A\u5E8F\u6570\u5B57\u4E0E\u4E4B\u76F8\u53CD\uFF08\u8D8A\u5927\u8D8A\u4F18\u5148\uFF09\u3002\n  priority Int\n  preset   PluginPreset @relation(fields: [presetId], references: [id], onDelete: Cascade)\n  plugin   Plugin       @relation(fields: [pluginId], references: [id], onDelete: Cascade)\n\n  @@unique([presetId, pluginId])\n  @@index([presetId, priority])\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"Project":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"baseUrl","kind":"scalar","type":"String"},{"name":"presetId","kind":"scalar","type":"String"},{"name":"preset","kind":"object","type":"PluginPreset","relationName":"PluginPresetToProject"},{"name":"viewport","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"testCases","kind":"object","type":"TestCase","relationName":"ProjectToTestCase"},{"name":"envVars","kind":"object","type":"EnvVar","relationName":"EnvVarToProject"},{"name":"loginConfigs","kind":"object","type":"LoginConfig","relationName":"LoginConfigToProject"}],"dbName":null},"EnvVar":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"projectId","kind":"scalar","type":"String"},{"name":"key","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"project","kind":"object","type":"Project","relationName":"EnvVarToProject"}],"dbName":null},"LoginConfig":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"projectId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"storageState","kind":"scalar","type":"Json"},{"name":"isDefault","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"project","kind":"object","type":"Project","relationName":"LoginConfigToProject"}],"dbName":null},"TestCase":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"projectId","kind":"scalar","type":"String"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"naturalLanguage","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"sortOrder","kind":"scalar","type":"Int"},{"name":"defaultScriptId","kind":"scalar","type":"String"},{"name":"defaultScript","kind":"object","type":"TestScript","relationName":"DefaultScript"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"project","kind":"object","type":"Project","relationName":"ProjectToTestCase"},{"name":"scripts","kind":"object","type":"TestScript","relationName":"TestCaseToTestScript"},{"name":"runs","kind":"object","type":"TestRun","relationName":"TestCaseToTestRun"},{"name":"generationLogs","kind":"object","type":"GenerationLog","relationName":"GenerationLogToTestCase"}],"dbName":null},"TestScript":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"testCaseId","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"Int"},{"name":"steps","kind":"scalar","type":"Json"},{"name":"rawCode","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"testCase","kind":"object","type":"TestCase","relationName":"TestCaseToTestScript"},{"name":"defaultFor","kind":"object","type":"TestCase","relationName":"DefaultScript"},{"name":"runs","kind":"object","type":"TestRun","relationName":"TestRunToTestScript"}],"dbName":null},"TestRun":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"testCaseId","kind":"scalar","type":"String"},{"name":"scriptId","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"startedAt","kind":"scalar","type":"DateTime"},{"name":"finishedAt","kind":"scalar","type":"DateTime"},{"name":"logs","kind":"scalar","type":"String"},{"name":"meta","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"testCase","kind":"object","type":"TestCase","relationName":"TestCaseToTestRun"},{"name":"script","kind":"object","type":"TestScript","relationName":"TestRunToTestScript"},{"name":"stepResults","kind":"object","type":"StepResult","relationName":"StepResultToTestRun"}],"dbName":null},"StepResult":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"runId","kind":"scalar","type":"String"},{"name":"stepIndex","kind":"scalar","type":"Int"},{"name":"action","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"message","kind":"scalar","type":"String"},{"name":"durationMs","kind":"scalar","type":"Int"},{"name":"screenshot","kind":"scalar","type":"String"},{"name":"consoleLog","kind":"scalar","type":"String"},{"name":"networkLog","kind":"scalar","type":"String"},{"name":"healed","kind":"scalar","type":"Boolean"},{"name":"healedLocator","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"run","kind":"object","type":"TestRun","relationName":"StepResultToTestRun"}],"dbName":null},"GenerationLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"jobId","kind":"scalar","type":"String"},{"name":"projectId","kind":"scalar","type":"String"},{"name":"testCaseId","kind":"scalar","type":"String"},{"name":"status","kind":"scalar","type":"String"},{"name":"nl","kind":"scalar","type":"String"},{"name":"startUrl","kind":"scalar","type":"String"},{"name":"finishedAt","kind":"scalar","type":"DateTime"},{"name":"totalUsage","kind":"scalar","type":"Json"},{"name":"scriptSteps","kind":"scalar","type":"Json"},{"name":"error","kind":"scalar","type":"String"},{"name":"loopState","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"steps","kind":"object","type":"GenerationStep","relationName":"GenerationLogToGenerationStep"},{"name":"testCase","kind":"object","type":"TestCase","relationName":"GenerationLogToTestCase"}],"dbName":null},"GenerationStep":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"logId","kind":"scalar","type":"String"},{"name":"type","kind":"scalar","type":"String"},{"name":"stepIndex","kind":"scalar","type":"Int"},{"name":"message","kind":"scalar","type":"String"},{"name":"system","kind":"scalar","type":"String"},{"name":"user","kind":"scalar","type":"String"},{"name":"assistant","kind":"scalar","type":"String"},{"name":"tool","kind":"scalar","type":"String"},{"name":"args","kind":"scalar","type":"Json"},{"name":"result","kind":"scalar","type":"String"},{"name":"error","kind":"scalar","type":"String"},{"name":"usage","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"log","kind":"object","type":"GenerationLog","relationName":"GenerationLogToGenerationStep"}],"dbName":null},"Plugin":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"version","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"kind","kind":"scalar","type":"String"},{"name":"entryFile","kind":"scalar","type":"String"},{"name":"source","kind":"scalar","type":"String"},{"name":"builtin","kind":"scalar","type":"Boolean"},{"name":"actions","kind":"scalar","type":"Json"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"presets","kind":"object","type":"PluginPresetItem","relationName":"PluginToPluginPresetItem"}],"dbName":null},"PluginPreset":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"builtin","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"items","kind":"object","type":"PluginPresetItem","relationName":"PluginPresetToPluginPresetItem"},{"name":"projects","kind":"object","type":"Project","relationName":"PluginPresetToProject"}],"dbName":null},"PluginPresetItem":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"presetId","kind":"scalar","type":"String"},{"name":"pluginId","kind":"scalar","type":"String"},{"name":"priority","kind":"scalar","type":"Int"},{"name":"preset","kind":"object","type":"PluginPreset","relationName":"PluginPresetToPluginPresetItem"},{"name":"plugin","kind":"object","type":"Plugin","relationName":"PluginToPluginPresetItem"}],"dbName":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","preset","presets","_count","plugin","items","projects","testCase","defaultFor","script","run","stepResults","runs","defaultScript","project","scripts","log","steps","generationLogs","testCases","envVars","loginConfigs","Project.findUnique","Project.findUniqueOrThrow","Project.findFirst","Project.findFirstOrThrow","Project.findMany","data","Project.createOne","Project.createMany","Project.createManyAndReturn","Project.updateOne","Project.updateMany","Project.updateManyAndReturn","create","update","Project.upsertOne","Project.deleteOne","Project.deleteMany","having","_min","_max","Project.groupBy","Project.aggregate","EnvVar.findUnique","EnvVar.findUniqueOrThrow","EnvVar.findFirst","EnvVar.findFirstOrThrow","EnvVar.findMany","EnvVar.createOne","EnvVar.createMany","EnvVar.createManyAndReturn","EnvVar.updateOne","EnvVar.updateMany","EnvVar.updateManyAndReturn","EnvVar.upsertOne","EnvVar.deleteOne","EnvVar.deleteMany","EnvVar.groupBy","EnvVar.aggregate","LoginConfig.findUnique","LoginConfig.findUniqueOrThrow","LoginConfig.findFirst","LoginConfig.findFirstOrThrow","LoginConfig.findMany","LoginConfig.createOne","LoginConfig.createMany","LoginConfig.createManyAndReturn","LoginConfig.updateOne","LoginConfig.updateMany","LoginConfig.updateManyAndReturn","LoginConfig.upsertOne","LoginConfig.deleteOne","LoginConfig.deleteMany","LoginConfig.groupBy","LoginConfig.aggregate","TestCase.findUnique","TestCase.findUniqueOrThrow","TestCase.findFirst","TestCase.findFirstOrThrow","TestCase.findMany","TestCase.createOne","TestCase.createMany","TestCase.createManyAndReturn","TestCase.updateOne","TestCase.updateMany","TestCase.updateManyAndReturn","TestCase.upsertOne","TestCase.deleteOne","TestCase.deleteMany","_avg","_sum","TestCase.groupBy","TestCase.aggregate","TestScript.findUnique","TestScript.findUniqueOrThrow","TestScript.findFirst","TestScript.findFirstOrThrow","TestScript.findMany","TestScript.createOne","TestScript.createMany","TestScript.createManyAndReturn","TestScript.updateOne","TestScript.updateMany","TestScript.updateManyAndReturn","TestScript.upsertOne","TestScript.deleteOne","TestScript.deleteMany","TestScript.groupBy","TestScript.aggregate","TestRun.findUnique","TestRun.findUniqueOrThrow","TestRun.findFirst","TestRun.findFirstOrThrow","TestRun.findMany","TestRun.createOne","TestRun.createMany","TestRun.createManyAndReturn","TestRun.updateOne","TestRun.updateMany","TestRun.updateManyAndReturn","TestRun.upsertOne","TestRun.deleteOne","TestRun.deleteMany","TestRun.groupBy","TestRun.aggregate","StepResult.findUnique","StepResult.findUniqueOrThrow","StepResult.findFirst","StepResult.findFirstOrThrow","StepResult.findMany","StepResult.createOne","StepResult.createMany","StepResult.createManyAndReturn","StepResult.updateOne","StepResult.updateMany","StepResult.updateManyAndReturn","StepResult.upsertOne","StepResult.deleteOne","StepResult.deleteMany","StepResult.groupBy","StepResult.aggregate","GenerationLog.findUnique","GenerationLog.findUniqueOrThrow","GenerationLog.findFirst","GenerationLog.findFirstOrThrow","GenerationLog.findMany","GenerationLog.createOne","GenerationLog.createMany","GenerationLog.createManyAndReturn","GenerationLog.updateOne","GenerationLog.updateMany","GenerationLog.updateManyAndReturn","GenerationLog.upsertOne","GenerationLog.deleteOne","GenerationLog.deleteMany","GenerationLog.groupBy","GenerationLog.aggregate","GenerationStep.findUnique","GenerationStep.findUniqueOrThrow","GenerationStep.findFirst","GenerationStep.findFirstOrThrow","GenerationStep.findMany","GenerationStep.createOne","GenerationStep.createMany","GenerationStep.createManyAndReturn","GenerationStep.updateOne","GenerationStep.updateMany","GenerationStep.updateManyAndReturn","GenerationStep.upsertOne","GenerationStep.deleteOne","GenerationStep.deleteMany","GenerationStep.groupBy","GenerationStep.aggregate","Plugin.findUnique","Plugin.findUniqueOrThrow","Plugin.findFirst","Plugin.findFirstOrThrow","Plugin.findMany","Plugin.createOne","Plugin.createMany","Plugin.createManyAndReturn","Plugin.updateOne","Plugin.updateMany","Plugin.updateManyAndReturn","Plugin.upsertOne","Plugin.deleteOne","Plugin.deleteMany","Plugin.groupBy","Plugin.aggregate","PluginPreset.findUnique","PluginPreset.findUniqueOrThrow","PluginPreset.findFirst","PluginPreset.findFirstOrThrow","PluginPreset.findMany","PluginPreset.createOne","PluginPreset.createMany","PluginPreset.createManyAndReturn","PluginPreset.updateOne","PluginPreset.updateMany","PluginPreset.updateManyAndReturn","PluginPreset.upsertOne","PluginPreset.deleteOne","PluginPreset.deleteMany","PluginPreset.groupBy","PluginPreset.aggregate","PluginPresetItem.findUnique","PluginPresetItem.findUniqueOrThrow","PluginPresetItem.findFirst","PluginPresetItem.findFirstOrThrow","PluginPresetItem.findMany","PluginPresetItem.createOne","PluginPresetItem.createMany","PluginPresetItem.createManyAndReturn","PluginPresetItem.updateOne","PluginPresetItem.updateMany","PluginPresetItem.updateManyAndReturn","PluginPresetItem.upsertOne","PluginPresetItem.deleteOne","PluginPresetItem.deleteMany","PluginPresetItem.groupBy","PluginPresetItem.aggregate","AND","OR","NOT","id","presetId","pluginId","priority","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","name","description","builtin","createdAt","updatedAt","every","some","none","version","kind","entryFile","source","actions","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","logId","type","stepIndex","message","system","user","assistant","tool","args","result","error","usage","jobId","projectId","testCaseId","status","nl","startUrl","finishedAt","totalUsage","scriptSteps","loopState","runId","action","durationMs","screenshot","consoleLog","networkLog","healed","healedLocator","scriptId","startedAt","logs","meta","rawCode","title","naturalLanguage","sortOrder","defaultScriptId","storageState","isDefault","key","value","baseUrl","viewport","projectId_key","testCaseId_version","presetId_pluginId","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","increment","decrement","multiply","divide"]'),
  graph: "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-ADApAAB_ACADAAAAOAAgAQAAOQAwAgAAOgAgAQAAABIAIAEAAAASACADAAAAEAAgAQAAEQAwAgAAEgAgAwAAABAAIAEAABEAMAIAABIAIAMAAAAQACABAAARADACAAASACAPDgAAygQAIA8AANAEACAQAADIBAAgEQAAyQQAIBQAAMsEACDjAQEAAAAB8wEBAAAAAfUBQAAAAAH2AUAAAAABkQIBAAAAAZMCAQAAAAGnAgEAAAABqAIBAAAAAakCAgAAAAGqAgEAAAABAR0AAIcBACAK4wEBAAAAAfMBAQAAAAH1AUAAAAAB9gFAAAAAAZECAQAAAAGTAgEAAAABpwIBAAAAAagCAQAAAAGpAgIAAAABqgIBAAAAAQEdAACJAQAwAR0AAIkBADABAAAAFAAgDw4AAOwDACAPAADqAwAgEAAAxgQAIBEAAOsDACAUAADtAwAg4wEBAKoDACHzAQEAtAMAIfUBQAC2AwAh9gFAALYDACGRAgEAqgMAIZMCAQCqAwAhpwIBAKoDACGoAgEAtAMAIakCAgCrAwAhqgIBALQDACECAAAAEgAgHQAAjQEAIArjAQEAqgMAIfMBAQC0AwAh9QFAALYDACH2AUAAtgMAIZECAQCqAwAhkwIBAKoDACGnAgEAqgMAIagCAQC0AwAhqQICAKsDACGqAgEAtAMAIQIAAAAQACAdAACPAQAgAgAAABAAIB0AAI8BACABAAAAFAAgAwAAABIAICQAAIcBACAlAACNAQAgAQAAABIAIAEAAAAQACAIBQAAkAUAICoAAJMFACArAACSBQAgXAAAkQUAIF0AAJQFACDzAQAAsAMAIKgCAACwAwAgqgIAALADACAN4AEAAP8CADDhAQAAlwEAEOIBAAD_AgAw4wEBANQCACHzAQEA3AIAIfUBQADeAgAh9gFAAN4CACGRAgEA1AIAIZMCAQDUAgAhpwIBANQCACGoAgEA3AIAIakCAgDVAgAhqgIBANwCACEDAAAAEAAgAQAAlgEAMCkAAJcBACADAAAAEAAgAQAAEQAwAgAAEgAgAQAAACQAIAEAAAAkACADAAAAFAAgAQAAIwAwAgAAJAAgAwAAABQAIAEAACMAMAIAACQAIAMAAAAUACABAAAjADACAAAkACAJCQAAjwUAIAoAAM0EACAOAADOBAAgE4AAAAAB4wEBAAAAAfUBQAAAAAH6AQIAAAABkgIBAAAAAaYCAQAAAAEBHQAAnwEAIAYTgAAAAAHjAQEAAAAB9QFAAAAAAfoBAgAAAAGSAgEAAAABpgIBAAAAAQEdAAChAQAwAR0AAKEBADAJCQAAjgUAIAoAALEEACAOAACyBAAgE4AAAAAB4wEBAKoDACH1AUAAtgMAIfoBAgCrAwAhkgIBAKoDACGmAgEAtAMAIQIAAAAkACAdAACkAQAgBhOAAAAAAeMBAQCqAwAh9QFAALYDACH6AQIAqwMAIZICAQCqAwAhpgIBALQDACECAAAAFAAgHQAApgEAIAIAAAAUACAdAACmAQAgAwAAACQAICQAAJ8BACAlAACkAQAgAQAAACQAIAEAAAAUACAGBQAAiQUAICoAAIwFACArAACLBQAgXAAAigUAIF0AAI0FACCmAgAAsAMAIAkTAAD9AgAg4AEAAPwCADDhAQAArQEAEOIBAAD8AgAw4wEBANQCACH1AUAA3gIAIfoBAgDVAgAhkgIBANQCACGmAgEA3AIAIQMAAAAUACABAACsAQAwKQAArQEAIAMAAAAUACABAAAjADACAAAkACABAAAAGQAgAQAAABkAIAMAAAAXACABAAAYADACAAAZACADAAAAFwAgAQAAGAAwAgAAGQAgAwAAABcAIAEAABgAMAIAABkAIAwJAAC9BAAgCwAApAQAIA0AAKUEACDjAQEAAAAB9QFAAAAAAZICAQAAAAGTAgEAAAABlgJAAAAAAaICAQAAAAGjAkAAAAABpAIBAAAAAaUCgAAAAAEBHQAAtQEAIAnjAQEAAAAB9QFAAAAAAZICAQAAAAGTAgEAAAABlgJAAAAAAaICAQAAAAGjAkAAAAABpAIBAAAAAaUCgAAAAAEBHQAAtwEAMAEdAAC3AQAwAQAAABQAIAwJAAC7BAAgCwAAlQQAIA0AAJYEACDjAQEAqgMAIfUBQAC2AwAhkgIBAKoDACGTAgEAqgMAIZYCQAD4AwAhogIBALQDACGjAkAA-AMAIaQCAQC0AwAhpQKAAAAAAQIAAAAZACAdAAC7AQAgCeMBAQCqAwAh9QFAALYDACGSAgEAqgMAIZMCAQCqAwAhlgJAAPgDACGiAgEAtAMAIaMCQAD4AwAhpAIBALQDACGlAoAAAAABAgAAABcAIB0AAL0BACACAAAAFwAgHQAAvQEAIAEAAAAUACADAAAAGQAgJAAAtQEAICUAALsBACABAAAAGQAgAQAAABcAIAgFAACGBQAgKgAAiAUAICsAAIcFACCWAgAAsAMAIKICAACwAwAgowIAALADACCkAgAAsAMAIKUCAACwAwAgDOABAAD7AgAw4QEAAMUBABDiAQAA-wIAMOMBAQDUAgAh9QFAAN4CACGSAgEA1AIAIZMCAQDUAgAhlgJAAPcCACGiAgEA3AIAIaMCQAD3AgAhpAIBANwCACGlAgAA7QIAIAMAAAAXACABAADEAQAwKQAAxQEAIAMAAAAXACABAAAYADACAAAZACABAAAAHgAgAQAAAB4AIAMAAAAcACABAAAdADACAAAeACADAAAAHAAgAQAAHQAwAgAAHgAgAwAAABwAIAEAAB0AMAIAAB4AIA4MAACFBQAg4wEBAAAAAfUBQAAAAAGGAgIAAAABhwIBAAAAAZMCAQAAAAGaAgEAAAABmwIBAAAAAZwCAgAAAAGdAgEAAAABngIBAAAAAZ8CAQAAAAGgAiAAAAABoQKAAAAAAQEdAADNAQAgDeMBAQAAAAH1AUAAAAABhgICAAAAAYcCAQAAAAGTAgEAAAABmgIBAAAAAZsCAQAAAAGcAgIAAAABnQIBAAAAAZ4CAQAAAAGfAgEAAAABoAIgAAAAAaECgAAAAAEBHQAAzwEAMAEdAADPAQAwDgwAAIQFACDjAQEAqgMAIfUBQAC2AwAhhgICAKsDACGHAgEAtAMAIZMCAQCqAwAhmgIBAKoDACGbAgEAqgMAIZwCAgCFBAAhnQIBALQDACGeAgEAtAMAIZ8CAQC0AwAhoAIgALUDACGhAoAAAAABAgAAAB4AIB0AANIBACAN4wEBAKoDACH1AUAAtgMAIYYCAgCrAwAhhwIBALQDACGTAgEAqgMAIZoCAQCqAwAhmwIBAKoDACGcAgIAhQQAIZ0CAQC0AwAhngIBALQDACGfAgEAtAMAIaACIAC1AwAhoQKAAAAAAQIAAAAcACAdAADUAQAgAgAAABwAIB0AANQBACADAAAAHgAgJAAAzQEAICUAANIBACABAAAAHgAgAQAAABwAIAsFAAD_BAAgKgAAggUAICsAAIEFACBcAACABQAgXQAAgwUAIIcCAACwAwAgnAIAALADACCdAgAAsAMAIJ4CAACwAwAgnwIAALADACChAgAAsAMAIBDgAQAA-gIAMOEBAADbAQAQ4gEAAPoCADDjAQEA1AIAIfUBQADeAgAhhgICANUCACGHAgEA3AIAIZMCAQDUAgAhmgIBANQCACGbAgEA1AIAIZwCAgDzAgAhnQIBANwCACGeAgEA3AIAIZ8CAQDcAgAhoAIgAN0CACGhAgAA7QIAIAMAAAAcACABAADaAQAwKQAA2wEAIAMAAAAcACABAAAdADACAAAeACABAAAAKQAgAQAAACkAIAMAAAAnACABAAAoADACAAApACADAAAAJwAgAQAAKAAwAgAAKQAgAwAAACcAIAEAACgAMAIAACkAIBAJAAD-BAAgEwAAiQQAIOMBAQAAAAH1AUAAAAAB9gFAAAAAAY4CAQAAAAGQAgEAAAABkQIBAAAAAZICAQAAAAGTAgEAAAABlAIBAAAAAZUCAQAAAAGWAkAAAAABlwKAAAAAAZgCgAAAAAGZAoAAAAABAR0AAOMBACAO4wEBAAAAAfUBQAAAAAH2AUAAAAABjgIBAAAAAZACAQAAAAGRAgEAAAABkgIBAAAAAZMCAQAAAAGUAgEAAAABlQIBAAAAAZYCQAAAAAGXAoAAAAABmAKAAAAAAZkCgAAAAAEBHQAA5QEAMAEdAADlAQAwAQAAABAAIBAJAAD9BAAgEwAA-gMAIOMBAQCqAwAh9QFAALYDACH2AUAAtgMAIY4CAQC0AwAhkAIBAKoDACGRAgEAtAMAIZICAQC0AwAhkwIBAKoDACGUAgEAqgMAIZUCAQC0AwAhlgJAAPgDACGXAoAAAAABmAKAAAAAAZkCgAAAAAECAAAAKQAgHQAA6QEAIA7jAQEAqgMAIfUBQAC2AwAh9gFAALYDACGOAgEAtAMAIZACAQCqAwAhkQIBALQDACGSAgEAtAMAIZMCAQCqAwAhlAIBAKoDACGVAgEAtAMAIZYCQAD4AwAhlwKAAAAAAZgCgAAAAAGZAoAAAAABAgAAACcAIB0AAOsBACACAAAAJwAgHQAA6wEAIAEAAAAQACADAAAAKQAgJAAA4wEAICUAAOkBACABAAAAKQAgAQAAACcAIAsFAAD6BAAgKgAA_AQAICsAAPsEACCOAgAAsAMAIJECAACwAwAgkgIAALADACCVAgAAsAMAIJYCAACwAwAglwIAALADACCYAgAAsAMAIJkCAACwAwAgEeABAAD2AgAw4QEAAPMBABDiAQAA9gIAMOMBAQDUAgAh9QFAAN4CACH2AUAA3gIAIY4CAQDcAgAhkAIBANQCACGRAgEA3AIAIZICAQDcAgAhkwIBANQCACGUAgEA1AIAIZUCAQDcAgAhlgJAAPcCACGXAgAA7QIAIJgCAADtAgAgmQIAAO0CACADAAAAJwAgAQAA8gEAMCkAAPMBACADAAAAJwAgAQAAKAAwAgAAKQAgAQAAAC0AIAEAAAAtACADAAAAKwAgAQAALAAwAgAALQAgAwAAACsAIAEAACwAMAIAAC0AIAMAAAArACABAAAsADACAAAtACAPEgAA-QQAIOMBAQAAAAH1AUAAAAABhAIBAAAAAYUCAQAAAAGGAgIAAAABhwIBAAAAAYgCAQAAAAGJAgEAAAABigIBAAAAAYsCAQAAAAGMAoAAAAABjQIBAAAAAY4CAQAAAAGPAoAAAAABAR0AAPsBACAO4wEBAAAAAfUBQAAAAAGEAgEAAAABhQIBAAAAAYYCAgAAAAGHAgEAAAABiAIBAAAAAYkCAQAAAAGKAgEAAAABiwIBAAAAAYwCgAAAAAGNAgEAAAABjgIBAAAAAY8CgAAAAAEBHQAA_QEAMAEdAAD9AQAwDxIAAPgEACDjAQEAqgMAIfUBQAC2AwAhhAIBAKoDACGFAgEAqgMAIYYCAgCFBAAhhwIBALQDACGIAgEAtAMAIYkCAQC0AwAhigIBALQDACGLAgEAtAMAIYwCgAAAAAGNAgEAtAMAIY4CAQC0AwAhjwKAAAAAAQIAAAAtACAdAACAAgAgDuMBAQCqAwAh9QFAALYDACGEAgEAqgMAIYUCAQCqAwAhhgICAIUEACGHAgEAtAMAIYgCAQC0AwAhiQIBALQDACGKAgEAtAMAIYsCAQC0AwAhjAKAAAAAAY0CAQC0AwAhjgIBALQDACGPAoAAAAABAgAAACsAIB0AAIICACACAAAAKwAgHQAAggIAIAMAAAAtACAkAAD7AQAgJQAAgAIAIAEAAAAtACABAAAAKwAgDwUAAPMEACAqAAD2BAAgKwAA9QQAIFwAAPQEACBdAAD3BAAghgIAALADACCHAgAAsAMAIIgCAACwAwAgiQIAALADACCKAgAAsAMAIIsCAACwAwAgjAIAALADACCNAgAAsAMAII4CAACwAwAgjwIAALADACAR4AEAAPICADDhAQAAiQIAEOIBAADyAgAw4wEBANQCACH1AUAA3gIAIYQCAQDUAgAhhQIBANQCACGGAgIA8wIAIYcCAQDcAgAhiAIBANwCACGJAgEA3AIAIYoCAQDcAgAhiwIBANwCACGMAgAA7QIAII0CAQDcAgAhjgIBANwCACGPAgAA7QIAIAMAAAArACABAACIAgAwKQAAiQIAIAMAAAArACABAAAsADACAAAtACAPBAAA6gIAIOABAADvAgAw4QEAAI8CABDiAQAA7wIAMOMBAQAAAAHyAQEAAAAB8wEBAOcCACH0ASAA6AIAIfUBQADpAgAh9gFAAOkCACH6AQEA8AIAIfsBAQDwAgAh_AEBAPACACH9AQEA8AIAIf4BAADxAgAgAQAAAIwCACABAAAAjAIAIA8EAADqAgAg4AEAAO8CADDhAQAAjwIAEOIBAADvAgAw4wEBAPACACHyAQEA8AIAIfMBAQDnAgAh9AEgAOgCACH1AUAA6QIAIfYBQADpAgAh-gEBAPACACH7AQEA8AIAIfwBAQDwAgAh_QEBAPACACH-AQAA8QIAIAMEAADjBAAg8wEAALADACD-AQAAsAMAIAMAAACPAgAgAQAAkAIAMAIAAIwCACADAAAAjwIAIAEAAJACADACAACMAgAgAwAAAI8CACABAACQAgAwAgAAjAIAIAwEAADyBAAg4wEBAAAAAfIBAQAAAAHzAQEAAAAB9AEgAAAAAfUBQAAAAAH2AUAAAAAB-gEBAAAAAfsBAQAAAAH8AQEAAAAB_QEBAAAAAf4BgAAAAAEBHQAAlAIAIAvjAQEAAAAB8gEBAAAAAfMBAQAAAAH0ASAAAAAB9QFAAAAAAfYBQAAAAAH6AQEAAAAB-wEBAAAAAfwBAQAAAAH9AQEAAAAB_gGAAAAAAQEdAACWAgAwAR0AAJYCADAMBAAA6AQAIOMBAQCqAwAh8gEBAKoDACHzAQEAtAMAIfQBIAC1AwAh9QFAALYDACH2AUAAtgMAIfoBAQCqAwAh-wEBAKoDACH8AQEAqgMAIf0BAQCqAwAh_gGAAAAAAQIAAACMAgAgHQAAmQIAIAvjAQEAqgMAIfIBAQCqAwAh8wEBALQDACH0ASAAtQMAIfUBQAC2AwAh9gFAALYDACH6AQEAqgMAIfsBAQCqAwAh_AEBAKoDACH9AQEAqgMAIf4BgAAAAAECAAAAjwIAIB0AAJsCACACAAAAjwIAIB0AAJsCACADAAAAjAIAICQAAJQCACAlAACZAgAgAQAAAIwCACABAAAAjwIAIAUFAADlBAAgKgAA5wQAICsAAOYEACDzAQAAsAMAIP4BAACwAwAgDuABAADsAgAw4QEAAKICABDiAQAA7AIAMOMBAQDUAgAh8gEBANQCACHzAQEA3AIAIfQBIADdAgAh9QFAAN4CACH2AUAA3gIAIfoBAQDUAgAh-wEBANQCACH8AQEA1AIAIf0BAQDUAgAh_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-wEBANQCACH8AQEA1AIAIf0BAQDUAgAh_gEAAO0CACAKBQAA5AIAICoAAO4CACArAADuAgAg5wGAAAAAAe4BgAAAAAH_AQEAAAABgAIBAAAAAYECAQAAAAGCAoAAAAABgwKAAAAAAQfnAYAAAAAB7gGAAAAAAf8BAQAAAAGAAgEAAAABgQIBAAAAAYICgAAAAAGDAoAAAAABDwQAAOoCACDgAQAA7wIAMOEBAACPAgAQ4gEAAO8CADDjAQEA8AIAIfIBAQDwAgAh8wEBAOcCACH0ASAA6AIAIfUBQADpAgAh9gFAAOkCACH6AQEA8AIAIfsBAQDwAgAh_AEBAPACACH9AQEA8AIAIf4BAADxAgAgC-cBAQAAAAHoAQEAAAAE6QEBAAAABOoBAQAAAAHrAQEAAAAB7AEBAAAAAe0BAQAAAAHuAQEA2gIAIe8BAQAAAAHwAQEAAAAB8QEBAAAAAQfnAYAAAAAB7gGAAAAAAf8BAQAAAAGAAgEAAAABgQIBAAAAAYICgAAAAAGDAoAAAAABEeABAADyAgAw4QEAAIkCABDiAQAA8gIAMOMBAQDUAgAh9QFAAN4CACGEAgEA1AIAIYUCAQDUAgAhhgICAPMCACGHAgEA3AIAIYgCAQDcAgAhiQIBANwCACGKAgEA3AIAIYsCAQDcAgAhjAIAAO0CACCNAgEA3AIAIY4CAQDcAgAhjwIAAO0CACANBQAA5AIAICoAAOQCACArAADkAgAgXAAA9QIAIF0AAOQCACDnAQIAAAAB6AECAAAABekBAgAAAAXqAQIAAAAB6wECAAAAAewBAgAAAAHtAQIAAAAB7gECAPQCACENBQAA5AIAICoAAOQCACArAADkAgAgXAAA9QIAIF0AAOQCACDnAQIAAAAB6AECAAAABekBAgAAAAXqAQIAAAAB6wECAAAAAewBAgAAAAHtAQIAAAAB7gECAPQCACEI5wEIAAAAAegBCAAAAAXpAQgAAAAF6gEIAAAAAesBCAAAAAHsAQgAAAAB7QEIAAAAAe4BCAD1AgAhEeABAAD2AgAw4QEAAPMBABDiAQAA9gIAMOMBAQDUAgAh9QFAAN4CACH2AUAA3gIAIY4CAQDcAgAhkAIBANQCACGRAgEA3AIAIZICAQDcAgAhkwIBANQCACGUAgEA1AIAIZUCAQDcAgAhlgJAAPcCACGXAgAA7QIAIJgCAADtAgAgmQIAAO0CACALBQAA5AIAICoAAPkCACArAAD5AgAg5wFAAAAAAegBQAAAAAXpAUAAAAAF6gFAAAAAAesBQAAAAAHsAUAAAAAB7QFAAAAAAe4BQAD4AgAhCwUAAOQCACAqAAD5AgAgKwAA-QIAIOcBQAAAAAHoAUAAAAAF6QFAAAAABeoBQAAAAAHrAUAAAAAB7AFAAAAAAe0BQAAAAAHuAUAA-AIAIQjnAUAAAAAB6AFAAAAABekBQAAAAAXqAUAAAAAB6wFAAAAAAewBQAAAAAHtAUAAAAAB7gFAAPkCACEQ4AEAAPoCADDhAQAA2wEAEOIBAAD6AgAw4wEBANQCACH1AUAA3gIAIYYCAgDVAgAhhwIBANwCACGTAgEA1AIAIZoCAQDUAgAhmwIBANQCACGcAgIA8wIAIZ0CAQDcAgAhngIBANwCACGfAgEA3AIAIaACIADdAgAhoQIAAO0CACAM4AEAAPsCADDhAQAAxQEAEOIBAAD7AgAw4wEBANQCACH1AUAA3gIAIZICAQDUAgAhkwIBANQCACGWAkAA9wIAIaICAQDcAgAhowJAAPcCACGkAgEA3AIAIaUCAADtAgAgCRMAAP0CACDgAQAA_AIAMOEBAACtAQAQ4gEAAPwCADDjAQEA1AIAIfUBQADeAgAh-gECANUCACGSAgEA1AIAIaYCAQDcAgAhCgUAANcCACAqAAD-AgAgKwAA_gIAIOcBgAAAAAHuAYAAAAAB_wEBAAAAAYACAQAAAAGBAgEAAAABggKAAAAAAYMCgAAAAAEH5wGAAAAAAe4BgAAAAAH_AQEAAAABgAIBAAAAAYECAQAAAAGCAoAAAAABgwKAAAAAAQ3gAQAA_wIAMOEBAACXAQAQ4gEAAP8CADDjAQEA1AIAIfMBAQDcAgAh9QFAAN4CACH2AUAA3gIAIZECAQDUAgAhkwIBANQCACGnAgEA1AIAIagCAQDcAgAhqQICANUCACGqAgEA3AIAIQrgAQAAgAMAMOEBAAB_ABDiAQAAgAMAMOMBAQDUAgAh8gEBANQCACH1AUAA3gIAIfYBQADeAgAhkQIBANQCACGrAgAA_QIAIKwCIADdAgAhCOABAACBAwAw4QEAAGkAEOIBAACBAwAw4wEBANQCACH1AUAA3gIAIZECAQDUAgAhrQIBANQCACGuAgEA1AIAIQrgAQAAggMAMOEBAABTABDiAQAAggMAMOMBAQDUAgAh5AEBANwCACHyAQEA1AIAIfUBQADeAgAh9gFAAN4CACGvAgEA3AIAIbACAADtAgAgCxAAAIUDACDgAQAAgwMAMOEBAAA4ABDiAQAAgwMAMOMBAQDwAgAh8gEBAPACACH1AUAA6QIAIfYBQADpAgAhkQIBAPACACGrAgAAhAMAIKwCIADoAgAhB-cBgAAAAAHuAYAAAAAB_wEBAAAAAYACAQAAAAGBAgEAAAABggKAAAAAAYMCgAAAAAEQAwAAngMAIBUAAJMDACAWAACfAwAgFwAAoAMAIOABAACdAwAw4QEAAAsAEOIBAACdAwAw4wEBAPACACHkAQEA5wIAIfIBAQDwAgAh9QFAAOkCACH2AUAA6QIAIa8CAQDnAgAhsAIAAPECACC0AgAACwAgtQIAAAsAIAKRAgEAAAABrQIBAAAAAQkQAACFAwAg4AEAAIcDADDhAQAANAAQ4gEAAIcDADDjAQEA8AIAIfUBQADpAgAhkQIBAPACACGtAgEA8AIAIa4CAQDwAgAhEhIAAIoDACDgAQAAiAMAMOEBAAArABDiAQAAiAMAMOMBAQDwAgAh9QFAAOkCACGEAgEA8AIAIYUCAQDwAgAhhgICAIkDACGHAgEA5wIAIYgCAQDnAgAhiQIBAOcCACGKAgEA5wIAIYsCAQDnAgAhjAIAAPECACCNAgEA5wIAIY4CAQDnAgAhjwIAAPECACAI5wECAAAAAegBAgAAAAXpAQIAAAAF6gECAAAAAesBAgAAAAHsAQIAAAAB7QECAAAAAe4BAgDkAgAhFQkAAI4DACATAACNAwAg4AEAAIsDADDhAQAAJwAQ4gEAAIsDADDjAQEA8AIAIfUBQADpAgAh9gFAAOkCACGOAgEA5wIAIZACAQDwAgAhkQIBAOcCACGSAgEA5wIAIZMCAQDwAgAhlAIBAPACACGVAgEA5wIAIZYCQACMAwAhlwIAAPECACCYAgAA8QIAIJkCAADxAgAgtAIAACcAILUCAAAnACATCQAAjgMAIBMAAI0DACDgAQAAiwMAMOEBAAAnABDiAQAAiwMAMOMBAQDwAgAh9QFAAOkCACH2AUAA6QIAIY4CAQDnAgAhkAIBAPACACGRAgEA5wIAIZICAQDnAgAhkwIBAPACACGUAgEA8AIAIZUCAQDnAgAhlgJAAIwDACGXAgAA8QIAIJgCAADxAgAgmQIAAPECACAI5wFAAAAAAegBQAAAAAXpAUAAAAAF6gFAAAAAAesBQAAAAAHsAUAAAAAB7QFAAAAAAe4BQAD5AgAhA_cBAAArACD4AQAAKwAg-QEAACsAIBQOAACUAwAgDwAAmAMAIBAAAIUDACARAACbAwAgFAAAnAMAIOABAACaAwAw4QEAABAAEOIBAACaAwAw4wEBAPACACHzAQEA5wIAIfUBQADpAgAh9gFAAOkCACGRAgEA8AIAIZMCAQDwAgAhpwIBAPACACGoAgEA5wIAIakCAgCRAwAhqgIBAOcCACG0AgAAEAAgtQIAABAAIAL6AQIAAAABkgIBAAAAAQwJAACSAwAgCgAAkwMAIA4AAJQDACATAACEAwAg4AEAAJADADDhAQAAFAAQ4gEAAJADADDjAQEA8AIAIfUBQADpAgAh-gECAJEDACGSAgEA8AIAIaYCAQDnAgAhCOcBAgAAAAHoAQIAAAAE6QECAAAABOoBAgAAAAHrAQIAAAAB7AECAAAAAe0BAgAAAAHuAQIA1wIAIRQOAACUAwAgDwAAmAMAIBAAAIUDACARAACbAwAgFAAAnAMAIOABAACaAwAw4QEAABAAEOIBAACaAwAw4wEBAPACACHzAQEA5wIAIfUBQADpAgAh9gFAAOkCACGRAgEA8AIAIZMCAQDwAgAhpwIBAPACACGoAgEA5wIAIakCAgCRAwAhqgIBAOcCACG0AgAAEAAgtQIAABAAIAP3AQAAEAAg-AEAABAAIPkBAAAQACAD9wEAABcAIPgBAAAXACD5AQAAFwAgEQwAAJYDACDgAQAAlQMAMOEBAAAcABDiAQAAlQMAMOMBAQDwAgAh9QFAAOkCACGGAgIAkQMAIYcCAQDnAgAhkwIBAPACACGaAgEA8AIAIZsCAQDwAgAhnAICAIkDACGdAgEA5wIAIZ4CAQDnAgAhnwIBAOcCACGgAiAA6AIAIaECAADxAgAgEQkAAJIDACALAACYAwAgDQAAmQMAIOABAACXAwAw4QEAABcAEOIBAACXAwAw4wEBAPACACH1AUAA6QIAIZICAQDwAgAhkwIBAPACACGWAkAAjAMAIaICAQDnAgAhowJAAIwDACGkAgEA5wIAIaUCAADxAgAgtAIAABcAILUCAAAXACAPCQAAkgMAIAsAAJgDACANAACZAwAg4AEAAJcDADDhAQAAFwAQ4gEAAJcDADDjAQEA8AIAIfUBQADpAgAhkgIBAPACACGTAgEA8AIAIZYCQACMAwAhogIBAOcCACGjAkAAjAMAIaQCAQDnAgAhpQIAAPECACAOCQAAkgMAIAoAAJMDACAOAACUAwAgEwAAhAMAIOABAACQAwAw4QEAABQAEOIBAACQAwAw4wEBAPACACH1AUAA6QIAIfoBAgCRAwAhkgIBAPACACGmAgEA5wIAIbQCAAAUACC1AgAAFAAgA_cBAAAcACD4AQAAHAAg-QEAABwAIBIOAACUAwAgDwAAmAMAIBAAAIUDACARAACbAwAgFAAAnAMAIOABAACaAwAw4QEAABAAEOIBAACaAwAw4wEBAPACACHzAQEA5wIAIfUBQADpAgAh9gFAAOkCACGRAgEA8AIAIZMCAQDwAgAhpwIBAPACACGoAgEA5wIAIakCAgCRAwAhqgIBAOcCACED9wEAABQAIPgBAAAUACD5AQAAFAAgA_cBAAAnACD4AQAAJwAg-QEAACcAIA4DAACeAwAgFQAAkwMAIBYAAJ8DACAXAACgAwAg4AEAAJ0DADDhAQAACwAQ4gEAAJ0DADDjAQEA8AIAIeQBAQDnAgAh8gEBAPACACH1AUAA6QIAIfYBQADpAgAhrwIBAOcCACGwAgAA8QIAIA0HAADqAgAgCAAA6wIAIOABAADmAgAw4QEAAAMAEOIBAADmAgAw4wEBAPACACHyAQEA8AIAIfMBAQDnAgAh9AEgAOgCACH1AUAA6QIAIfYBQADpAgAhtAIAAAMAILUCAAADACAD9wEAADQAIPgBAAA0ACD5AQAANAAgA_cBAAA4ACD4AQAAOAAg-QEAADgAIALkAQEAAAAB5QEBAAAAAQkDAACjAwAgBgAApAMAIOABAACiAwAw4QEAAAUAEOIBAACiAwAw4wEBAPACACHkAQEA8AIAIeUBAQDwAgAh5gECAJEDACENBwAA6gIAIAgAAOsCACDgAQAA5gIAMOEBAAADABDiAQAA5gIAMOMBAQDwAgAh8gEBAPACACHzAQEA5wIAIfQBIADoAgAh9QFAAOkCACH2AUAA6QIAIbQCAAADACC1AgAAAwAgEQQAAOoCACDgAQAA7wIAMOEBAACPAgAQ4gEAAO8CADDjAQEA8AIAIfIBAQDwAgAh8wEBAOcCACH0ASAA6AIAIfUBQADpAgAh9gFAAOkCACH6AQEA8AIAIfsBAQDwAgAh_AEBAPACACH9AQEA8AIAIf4BAADxAgAgtAIAAI8CACC1AgAAjwIAIAAAAAAAAbkCAQAAAAEFuQICAAAAAb8CAgAAAAHAAgIAAAABwQICAAAAAcICAgAAAAEFJAAA-QUAICUAAP8FACC2AgAA-gUAILcCAAD-BQAgvAIAAKUCACAFJAAA9wUAICUAAPwFACC2AgAA-AUAILcCAAD7BQAgvAIAAIwCACADJAAA-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-wMAMCUAAIAEADC2AgAA_AMAMLcCAAD9AwAwuAIAAP4DACC5AgAA_wMAMLoCAAD_AwAwuwIAAP8DADC8AgAA_wMAML0CAACBBAAwvgIAAIIEADAN4wEBAAAAAfUBQAAAAAGFAgEAAAABhgICAAAAAYcCAQAAAAGIAgEAAAABiQIBAAAAAYoCAQAAAAGLAgEAAAABjAKAAAAAAY0CAQAAAAGOAgEAAAABjwKAAAAAAQIAAAAtACAkAACHBAAgAwAAAC0AICQAAIcEACAlAACGBAAgAR0AAO4FADASEgAAigMAIOABAACIAwAw4QEAACsAEOIBAACIAwAw4wEBAAAAAfUBQADpAgAhhAIBAPACACGFAgEA8AIAIYYCAgCJAwAhhwIBAOcCACGIAgEA5wIAIYkCAQDnAgAhigIBAOcCACGLAgEA5wIAIYwCAADxAgAgjQIBAOcCACGOAgEA5wIAIY8CAADxAgAgAgAAAC0AIB0AAIYEACACAAAAgwQAIB0AAIQEACAR4AEAAIIEADDhAQAAgwQAEOIBAACCBAAw4wEBAPACACH1AUAA6QIAIYQCAQDwAgAhhQIBAPACACGGAgIAiQMAIYcCAQDnAgAhiAIBAOcCACGJAgEA5wIAIYoCAQDnAgAhiwIBAOcCACGMAgAA8QIAII0CAQDnAgAhjgIBAOcCACGPAgAA8QIAIBHgAQAAggQAMOEBAACDBAAQ4gEAAIIEADDjAQEA8AIAIfUBQADpAgAhhAIBAPACACGFAgEA8AIAIYYCAgCJAwAhhwIBAOcCACGIAgEA5wIAIYkCAQDnAgAhigIBAOcCACGLAgEA5wIAIYwCAADxAgAgjQIBAOcCACGOAgEA5wIAIY8CAADxAgAgDeMBAQCqAwAh9QFAALYDACGFAgEAqgMAIYYCAgCFBAAhhwIBALQDACGIAgEAtAMAIYkCAQC0AwAhigIBALQDACGLAgEAtAMAIYwCgAAAAAGNAgEAtAMAIY4CAQC0AwAhjwKAAAAAAQW5AgIAAAABvwICAAAAAcACAgAAAAHBAgIAAAABwgICAAAAAQ3jAQEAqgMAIfUBQAC2AwAhhQIBAKoDACGGAgIAhQQAIYcCAQC0AwAhiAIBALQDACGJAgEAtAMAIYoCAQC0AwAhiwIBALQDACGMAoAAAAABjQIBALQDACGOAgEAtAMAIY8CgAAAAAEN4wEBAAAAAfUBQAAAAAGFAgEAAAABhgICAAAAAYcCAQAAAAGIAgEAAAABiQIBAAAAAYoCAQAAAAGLAgEAAAABjAKAAAAAAY0CAQAAAAGOAgEAAAABjwKAAAAAAQ4TAACJBAAg4wEBAAAAAfUBQAAAAAH2AUAAAAABjgIBAAAAAZACAQAAAAGRAgEAAAABkwIBAAAAAZQCAQAAAAGVAgEAAAABlgJAAAAAAZcCgAAAAAGYAoAAAAABmQKAAAAAAQQkAAD7AwAwtgIAAPwDADC4AgAA_gMAILwCAAD_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_BQAgvAIAAAEAIAMkAAC9BQAgtgIAAL4FACC8AgAAAQAgAAAABSQAALgFACAlAAC7BQAgtgIAALkFACC3AgAAugUAILwCAAABACADJAAAuAUAILYCAAC5BQAgvAIAAAEAIAAAAAckAACzBQAgJQAAtgUAILYCAAC0BQAgtwIAALUFACC6AgAAAwAguwIAAAMAILwCAAClAgAgAyQAALMFACC2AgAAtAUAILwCAAClAgAgBwMAAK8FACAVAACoBQAgFgAAsAUAIBcAALEFACDkAQAAsAMAIK8CAACwAwAgsAIAALADACAKCQAApwUAIBMAAKYFACCOAgAAsAMAIJECAACwAwAgkgIAALADACCVAgAAsAMAIJYCAACwAwAglwIAALADACCYAgAAsAMAIJkCAACwAwAgAAgOAACpBQAgDwAAqwUAIBAAAKQFACARAACtBQAgFAAArgUAIPMBAACwAwAgqAIAALADACCqAgAAsAMAIAAACAkAAKcFACALAACrBQAgDQAArAUAIJYCAACwAwAgogIAALADACCjAgAAsAMAIKQCAACwAwAgpQIAALADACAECQAApwUAIAoAAKgFACAOAACpBQAgpgIAALADACAAAAADBwAA4wQAIAgAAOQEACDzAQAAsAMAIAAAAwQAAOMEACDzAQAAsAMAIP4BAACwAwAgBwcAAOEEACDjAQEAAAAB8gEBAAAAAfMBAQAAAAH0ASAAAAAB9QFAAAAAAfYBQAAAAAECAAAApQIAICQAALMFACADAAAAAwAgJAAAswUAICUAALcFACAJAAAAAwAgBwAAtwMAIB0AALcFACDjAQEAqgMAIfIBAQCqAwAh8wEBALQDACH0ASAAtQMAIfUBQAC2AwAh9gFAALYDACEHBwAAtwMAIOMBAQCqAwAh8gEBAKoDACHzAQEAtAMAIfQBIAC1AwAh9QFAALYDACH2AUAAtgMAIQoDAACjBQAgFQAA0gQAIBcAANQEACDjAQEAAAAB5AEBAAAAAfIBAQAAAAH1AUAAAAAB9gFAAAAAAa8CAQAAAAGwAoAAAAABAgAAAAEAICQAALgFACADAAAACwAgJAAAuAUAICUAALwFACAMAAAACwAgAwAAogUAIBUAAMQDACAXAADGAwAgHQAAvAUAIOMBAQCqAwAh5AEBALQDACHyAQEAqgMAIfUBQAC2AwAh9gFAALYDACGvAgEAtAMAIbACgAAAAAEKAwAAogUAIBUAAMQDACAXAADGAwAg4wEBAKoDACHkAQEAtAMAIfIBAQCqAwAh9QFAALYDACH2AUAAtgMAIa8CAQC0AwAhsAKAAAAAAQoDAACjBQAgFQAA0gQAIBYAANMEACDjAQEAAAAB5AEBAAAAAfIBAQAAAAH1AUAAAAAB9gFAAAAAAa8CAQAAAAGwAoAAAAABAgAAAAEAICQAAL0FACADAAAACwAgJAAAvQUAICUAAMEFACAMAAAACwAgAwAAogUAIBUAAMQDACAWAADFAwAgHQAAwQUAIOMBAQCqAwAh5AEBALQDACHyAQEAqgMAIfUBQAC2AwAh9gFAALYDACGvAgEAtAMAIbACgAAAAAEKAwAAogUAIBUAAMQDACAWAADFAwAg4wEBAKoDACHkAQEAtAMAIfIBAQCqAwAh9QFAALYDACH2AUAAtgMAIa8CAQC0AwAhsAKAAAAAAQ4OAADKBAAgDwAA0AQAIBAAAMgEACAUAADLBAAg4wEBAAAAAfMBAQAAAAH1AUAAAAAB9gFAAAAAAZECAQAAAAGTAgEAAAABpwIBAAAAAagCAQAAAAGpAgIAAAABqgIBAAAAAQIAAAASACAkAADCBQAgAwAAABAAICQAAMIFACAlAADGBQAgEAAAABAAIA4AAOwDACAPAADqAwAgEAAAxgQAIBQAAO0DACAdAADGBQAg4wEBAKoDACHzAQEAtAMAIfUBQAC2AwAh9gFAALYDACGRAgEAqgMAIZMCAQCqAwAhpwIBAKoDACGoAgEAtAMAIakCAgCrAwAhqgIBALQDACEODgAA7AMAIA8AAOoDACAQAADGBAAgFAAA7QMAIOMBAQCqAwAh8wEBALQDACH1AUAAtgMAIfYBQAC2AwAhkQIBAKoDACGTAgEAqgMAIacCAQCqAwAhqAIBALQDACGpAgIAqwMAIaoCAQC0AwAhCwkAAL0EACALAACkBAAg4wEBAAAAAfUBQAAAAAGSAgEAAAABkwIBAAAAAZYCQAAAAAGiAgEAAAABowJAAAAAAaQCAQAAAAGlAoAAAAABAgAAABkAICQAAMcFACADAAAAFwAgJAAAxwUAICUAAMsFACANAAAAFwAgCQAAuwQAIAsAAJUEACAdAADLBQAg4wEBAKoDACH1AUAAtgMAIZICAQCqAwAhkwIBAKoDACGWAkAA-AMAIaICAQC0AwAhowJAAPgDACGkAgEAtAMAIaUCgAAAAAELCQAAuwQAIAsAAJUEACDjAQEAqgMAIfUBQAC2AwAhkgIBAKoDACGTAgEAqgMAIZYCQAD4AwAhogIBALQDACGjAkAA-AMAIaQCAQC0AwAhpQKAAAAAAQ4OAADKBAAgDwAA0AQAIBAAAMgEACARAADJBAAg4wEBAAAAAfMBAQAAAAH1AUAAAAAB9gFAAAAAAZECAQAAAAGTAgEAAAABpwIBAAAAAagCAQAAAAGpAgIAAAABqgIBAAAAAQIAAAASACAkAADMBQAgAwAAABAAICQAAMwFACAlAADQBQAgEAAAABAAIA4AAOwDACAPAADqAwAgEAAAxgQAIBEAAOsDACAdAADQBQAg4wEBAKoDACHzAQEAtAMAIfUBQAC2AwAh9gFAALYDACGRAgEAqgMAIZMCAQCqAwAhpwIBAKoDACGoAgEAtAMAIakCAgCrAwAhqgIBALQDACEODgAA7AMAIA8AAOoDACAQAADGBAAgEQAA6wMAIOMBAQCqAwAh8wEBALQDACH1AUAAtgMAIfYBQAC2AwAhkQIBAKoDACGTAgEAqgMAIacCAQCqAwAhqAIBALQDACGpAgIAqwMAIaoCAQC0AwAhDwkAAP4EACDjAQEAAAAB9QFAAAAAAfYBQAAAAAGOAgEAAAABkAIBAAAAAZECAQAAAAGSAgEAAAABkwIBAAAAAZQCAQAAAAGVAgEAAAABlgJAAAAAAZcCgAAAAAGYAoAAAAABmQKAAAAAAQIAAAApACAkAADRBQAgAwAAACcAICQAANEFACAlAADVBQAgEQAAACcAIAkAAP0EACAdAADVBQAg4wEBAKoDACH1AUAAtgMAIfYBQAC2AwAhjgIBALQDACGQAgEAqgMAIZECAQC0AwAhkgIBALQDACGTAgEAqgMAIZQCAQCqAwAhlQIBALQDACGWAkAA-AMAIZcCgAAAAAGYAoAAAAABmQKAAAAAAQ8JAAD9BAAg4wEBAKoDACH1AUAAtgMAIfYBQAC2AwAhjgIBALQDACGQAgEAqgMAIZECAQC0AwAhkgIBALQDACGTAgEAqgMAIZQCAQCqAwAhlQIBALQDACGWAkAA-AMAIZcCgAAAAAGYAoAAAAABmQKAAAAAAQPjAQEAAAAB5AEBAAAAAeYBAgAAAAED4wEBAAAAAeUBAQAAAAHmAQIAAAABCAkAAI8FACAOAADOBAAgE4AAAAAB4wEBAAAAAfUBQAAAAAH6AQIAAAABkgIBAAAAAaYCAQAAAAECAAAAJAAgJAAA2AUAIAoDAACjBQAgFgAA0wQAIBcAANQEACDjAQEAAAAB5AEBAAAAAfIBAQAAAAH1AUAAAAAB9gFAAAAAAa8CAQAAAAGwAoAAAAABAgAAAAEAICQAANoFACADAAAACwAgJAAA2gUAICUAAN4FACAMAAAACwAgAwAAogUAIBYAAMUDACAXAADGAwAgHQAA3gUAIOMBAQCqAwAh5AEBALQDACHyAQEAqgMAIfUBQAC2AwAh9gFAALYDACGvAgEAtAMAIbACgAAAAAEKAwAAogUAIBYAAMUDACAXAADGAwAg4wEBAKoDACHkAQEAtAMAIfIBAQCqAwAh9QFAALYDACH2AUAAtgMAIa8CAQC0AwAhsAKAAAAAAQnjAQEAAAAB8wEBAAAAAfUBQAAAAAH2AUAAAAABkQIBAAAAAZMCAQAAAAGnAgEAAAABqAIBAAAAAakCAgAAAAEODwAA0AQAIBAAAMgEACARAADJBAAgFAAAywQAIOMBAQAAAAHzAQEAAAAB9QFAAAAAAfYBQAAAAAGRAgEAAAABkwIBAAAAAacCAQAAAAGoAgEAAAABqQICAAAAAaoCAQAAAAECAAAAEgAgJAAA4AUAIAMAAAAQACAkAADgBQAgJQAA5AUAIBAAAAAQACAPAADqAwAgEAAAxgQAIBEAAOsDACAUAADtAwAgHQAA5AUAIOMBAQCqAwAh8wEBALQDACH1AUAAtgMAIfYBQAC2AwAhkQIBAKoDACGTAgEAqgMAIacCAQCqAwAhqAIBALQDACGpAgIAqwMAIaoCAQC0AwAhDg8AAOoDACAQAADGBAAgEQAA6wMAIBQAAO0DACDjAQEAqgMAIfMBAQC0AwAh9QFAALYDACH2AUAAtgMAIZECAQCqAwAhkwIBAKoDACGnAgEAqgMAIagCAQC0AwAhqQICAKsDACGqAgEAtAMAIQjjAQEAAAAB9QFAAAAAAZICAQAAAAGTAgEAAAABlgJAAAAAAaMCQAAAAAGkAgEAAAABpQKAAAAAAQUTgAAAAAHjAQEAAAAB9QFAAAAAAfoBAgAAAAGmAgEAAAABCAkAAI8FACAKAADNBAAgE4AAAAAB4wEBAAAAAfUBQAAAAAH6AQIAAAABkgIBAAAAAaYCAQAAAAECAAAAJAAgJAAA5wUAIAzjAQEAAAAB9QFAAAAAAYYCAgAAAAGHAgEAAAABkwIBAAAAAZsCAQAAAAGcAgIAAAABnQIBAAAAAZ4CAQAAAAGfAgEAAAABoAIgAAAAAaECgAAAAAEDAAAAFAAgJAAA5wUAICUAAOwFACAKAAAAFAAgCQAAjgUAIAoAALEEACATgAAAAAEdAADsBQAg4wEBAKoDACH1AUAAtgMAIfoBAgCrAwAhkgIBAKoDACGmAgEAtAMAIQgJAACOBQAgCgAAsQQAIBOAAAAAAeMBAQCqAwAh9QFAALYDACH6AQIAqwMAIZICAQCqAwAhpgIBALQDACEI4wEBAAAAAfUBQAAAAAGTAgEAAAABlgJAAAAAAaICAQAAAAGjAkAAAAABpAIBAAAAAaUCgAAAAAEN4wEBAAAAAfUBQAAAAAGFAgEAAAABhgICAAAAAYcCAQAAAAGIAgEAAAABiQIBAAAAAYoCAQAAAAGLAgEAAAABjAKAAAAAAY0CAQAAAAGOAgEAAAABjwKAAAAAAQ3jAQEAAAAB9QFAAAAAAfYBQAAAAAGOAgEAAAABkAIBAAAAAZECAQAAAAGTAgEAAAABlAIBAAAAAZUCAQAAAAGWAkAAAAABlwKAAAAAAZgCgAAAAAGZAoAAAAABAwAAABQAICQAANgFACAlAADyBQAgCgAAABQAIAkAAI4FACAOAACyBAAgE4AAAAABHQAA8gUAIOMBAQCqAwAh9QFAALYDACH6AQIAqwMAIZICAQCqAwAhpgIBALQDACEICQAAjgUAIA4AALIEACATgAAAAAHjAQEAqgMAIfUBQAC2AwAh-gECAKsDACGSAgEAqgMAIaYCAQC0AwAhCeMBAQAAAAHzAQEAAAAB9QFAAAAAAfYBQAAAAAGTAgEAAAABpwIBAAAAAagCAQAAAAGpAgIAAAABqgIBAAAAAQTjAQEAAAAB9QFAAAAAAa0CAQAAAAGuAgEAAAABBuMBAQAAAAHyAQEAAAAB9QFAAAAAAfYBQAAAAAGrAoAAAAABrAIgAAAAAQbjAQEAAAAB8gEBAAAAAfUBQAAAAAH2AUAAAAABrwIBAAAAAbACgAAAAAEL4wEBAAAAAfIBAQAAAAHzAQEAAAAB9AEgAAAAAfUBQAAAAAH2AUAAAAAB-gEBAAAAAfsBAQAAAAH8AQEAAAAB_QEBAAAAAf4BgAAAAAECAAAAjAIAICQAAPcFACAHCAAA4gQAIOMBAQAAAAHyAQEAAAAB8wEBAAAAAfQBIAAAAAH1AUAAAAAB9gFAAAAAAQIAAAClAgAgJAAA-QUAIAMAAACPAgAgJAAA9wUAICUAAP0FACANAAAAjwIAIB0AAP0FACDjAQEAqgMAIfIBAQCqAwAh8wEBALQDACH0ASAAtQMAIfUBQAC2AwAh9gFAALYDACH6AQEAqgMAIfsBAQCqAwAh_AEBAKoDACH9AQEAqgMAIf4BgAAAAAEL4wEBAKoDACHyAQEAqgMAIfMBAQC0AwAh9AEgALUDACH1AUAAtgMAIfYBQAC2AwAh-gEBAKoDACH7AQEAqgMAIfwBAQCqAwAh_QEBAKoDACH-AYAAAAABAwAAAAMAICQAAPkFACAlAACABgAgCQAAAAMAIAgAALgDACAdAACABgAg4wEBAKoDACHyAQEAqgMAIfMBAQC0AwAh9AEgALUDACH1AUAAtgMAIfYBQAC2AwAhBwgAALgDACDjAQEAqgMAIfIBAQCqAwAh8wEBALQDACH0ASAAtQMAIfUBQAC2AwAh9gFAALYDACEFAwQCBQATFRMHFjcRFzsSAwUABgcIAwgNAQIDAAIGAAQCBAkDBQAFAQQKAAIHDgAIDwAGBQAQDiYJDxUIEAABESUIFCoNBAUADAkABwoWBw4aCQQFAAsJAAcLGwgNHwoBDAAJAQ0gAAIKIQAOIgADBQAPCS8HEy4OARIADQETMAADDjIAETEAFDMAARAAAQEQAAEDFTwAFj0AFz4AAAEDSAIBA04CAwUAGCoAGSsAGgAAAAMFABgqABkrABoBEAABARAAAQMFAB8qACArACEAAAADBQAfKgAgKwAhARAAAQEQAAEDBQAmKgAnKwAoAAAAAwUAJioAJysAKAIPjAEIEAABAg-SAQgQAAEFBQAtKgAwKwAxXAAuXQAvAAAAAAAFBQAtKgAwKwAxXAAuXQAvAQkABwEJAAcFBQA2KgA5KwA6XAA3XQA4AAAAAAAFBQA2KgA5KwA6XAA3XQA4AgkABwu6AQgCCQAHC8ABCAMFAD8qAEArAEEAAAADBQA_KgBAKwBBAQwACQEMAAkFBQBGKgBJKwBKXABHXQBIAAAAAAAFBQBGKgBJKwBKXABHXQBIAQnoAQcBCe4BBwMFAE8qAFArAFEAAAADBQBPKgBQKwBRARIADQESAA0FBQBWKgBZKwBaXABXXQBYAAAAAAAFBQBWKgBZKwBaXABXXQBYAAADBQBfKgBgKwBhAAAAAwUAXyoAYCsAYQAAAwUAZioAZysAaAAAAAMFAGYqAGcrAGgCAwACBgAEAgMAAgYABAUFAG0qAHArAHFcAG5dAG8AAAAAAAUFAG0qAHArAHFcAG5dAG8YAgEZPwEaQAEbQQEcQgEeRAEfRhQgRxUhSgEiTBQjTRYmTwEnUAEoURQsVBctVRsuVhEvVxEwWBExWREyWhEzXBE0XhQ1Xxw2YRE3YxQ4ZB05ZRE6ZhE7ZxQ8ah49ayI-bBI_bRJAbhJBbxJCcBJDchJEdBRFdSNGdxJHeRRIeiRJexJKfBJLfRRMgAElTYEBKU6CAQdPgwEHUIQBB1GFAQdShgEHU4gBB1SKARRViwEqVo4BB1eQARRYkQErWZMBB1qUAQdblQEUXpgBLF-ZATJgmgEIYZsBCGKcAQhjnQEIZJ4BCGWgAQhmogEUZ6MBM2ilAQhppwEUaqgBNGupAQhsqgEIbasBFG6uATVvrwE7cLABCXGxAQlysgEJc7MBCXS0AQl1tgEJdrgBFHe5ATx4vAEJeb4BFHq_AT17wQEJfMIBCX3DARR-xgE-f8cBQoAByAEKgQHJAQqCAcoBCoMBywEKhAHMAQqFAc4BCoYB0AEUhwHRAUOIAdMBCokB1QEUigHWAUSLAdcBCowB2AEKjQHZARSOAdwBRY8B3QFLkAHeAQ2RAd8BDZIB4AENkwHhAQ2UAeIBDZUB5AENlgHmARSXAecBTJgB6gENmQHsARSaAe0BTZsB7wENnAHwAQ2dAfEBFJ4B9AFOnwH1AVKgAfYBDqEB9wEOogH4AQ6jAfkBDqQB-gEOpQH8AQ6mAf4BFKcB_wFTqAGBAg6pAYMCFKoBhAJUqwGFAg6sAYYCDq0BhwIUrgGKAlWvAYsCW7ABjQIEsQGOAgSyAZECBLMBkgIEtAGTAgS1AZUCBLYBlwIUtwGYAly4AZoCBLkBnAIUugGdAl27AZ4CBLwBnwIEvQGgAhS-AaMCXr8BpAJiwAGmAgLBAacCAsIBqQICwwGqAgLEAasCAsUBrQICxgGvAhTHAbACY8gBsgICyQG0AhTKAbUCZMsBtgICzAG3AgLNAbgCFM4BuwJlzwG8AmnQAb0CA9EBvgID0gG_AgPTAcACA9QBwQID1QHDAgPWAcUCFNcBxgJq2AHIAgPZAcoCFNoBywJr2wHMAgPcAc0CA90BzgIU3gHRAmzfAdICcg"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.sqlite.mjs"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.mjs");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// generated/prisma/internal/prismaNamespace.ts
var prismaNamespace_exports = {};
__export(prismaNamespace_exports, {
  AnyNull: () => AnyNull2,
  DbNull: () => DbNull2,
  Decimal: () => Decimal2,
  EnvVarScalarFieldEnum: () => EnvVarScalarFieldEnum,
  GenerationLogScalarFieldEnum: () => GenerationLogScalarFieldEnum,
  GenerationStepScalarFieldEnum: () => GenerationStepScalarFieldEnum,
  JsonNull: () => JsonNull2,
  JsonNullValueFilter: () => JsonNullValueFilter,
  JsonNullValueInput: () => JsonNullValueInput,
  LoginConfigScalarFieldEnum: () => LoginConfigScalarFieldEnum,
  ModelName: () => ModelName,
  NullTypes: () => NullTypes2,
  NullableJsonNullValueInput: () => NullableJsonNullValueInput,
  NullsOrder: () => NullsOrder,
  PluginPresetItemScalarFieldEnum: () => PluginPresetItemScalarFieldEnum,
  PluginPresetScalarFieldEnum: () => PluginPresetScalarFieldEnum,
  PluginScalarFieldEnum: () => PluginScalarFieldEnum,
  PrismaClientInitializationError: () => PrismaClientInitializationError2,
  PrismaClientKnownRequestError: () => PrismaClientKnownRequestError2,
  PrismaClientRustPanicError: () => PrismaClientRustPanicError2,
  PrismaClientUnknownRequestError: () => PrismaClientUnknownRequestError2,
  PrismaClientValidationError: () => PrismaClientValidationError2,
  ProjectScalarFieldEnum: () => ProjectScalarFieldEnum,
  QueryMode: () => QueryMode,
  SortOrder: () => SortOrder,
  Sql: () => Sql2,
  StepResultScalarFieldEnum: () => StepResultScalarFieldEnum,
  TestCaseScalarFieldEnum: () => TestCaseScalarFieldEnum,
  TestRunScalarFieldEnum: () => TestRunScalarFieldEnum,
  TestScriptScalarFieldEnum: () => TestScriptScalarFieldEnum,
  TransactionIsolationLevel: () => TransactionIsolationLevel,
  defineExtension: () => defineExtension,
  empty: () => empty2,
  getExtensionContext: () => getExtensionContext,
  join: () => join2,
  prismaVersion: () => prismaVersion,
  raw: () => raw2,
  sql: () => sql
});
import * as runtime2 from "@prisma/client/runtime/client";
var PrismaClientKnownRequestError2 = runtime2.PrismaClientKnownRequestError;
var PrismaClientUnknownRequestError2 = runtime2.PrismaClientUnknownRequestError;
var PrismaClientRustPanicError2 = runtime2.PrismaClientRustPanicError;
var PrismaClientInitializationError2 = runtime2.PrismaClientInitializationError;
var PrismaClientValidationError2 = runtime2.PrismaClientValidationError;
var sql = runtime2.sqltag;
var empty2 = runtime2.empty;
var join2 = runtime2.join;
var raw2 = runtime2.raw;
var Sql2 = runtime2.Sql;
var Decimal2 = runtime2.Decimal;
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var prismaVersion = {
  client: "7.8.0",
  engine: "3c6e192761c0362d496ed980de936e2f3cebcd3a"
};
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var DbNull2 = runtime2.DbNull;
var JsonNull2 = runtime2.JsonNull;
var AnyNull2 = runtime2.AnyNull;
var ModelName = {
  Project: "Project",
  EnvVar: "EnvVar",
  LoginConfig: "LoginConfig",
  TestCase: "TestCase",
  TestScript: "TestScript",
  TestRun: "TestRun",
  StepResult: "StepResult",
  GenerationLog: "GenerationLog",
  GenerationStep: "GenerationStep",
  Plugin: "Plugin",
  PluginPreset: "PluginPreset",
  PluginPresetItem: "PluginPresetItem"
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  Serializable: "Serializable"
});
var ProjectScalarFieldEnum = {
  id: "id",
  name: "name",
  baseUrl: "baseUrl",
  presetId: "presetId",
  viewport: "viewport",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var EnvVarScalarFieldEnum = {
  id: "id",
  projectId: "projectId",
  key: "key",
  value: "value",
  createdAt: "createdAt"
};
var LoginConfigScalarFieldEnum = {
  id: "id",
  projectId: "projectId",
  name: "name",
  storageState: "storageState",
  isDefault: "isDefault",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var TestCaseScalarFieldEnum = {
  id: "id",
  projectId: "projectId",
  title: "title",
  description: "description",
  naturalLanguage: "naturalLanguage",
  status: "status",
  sortOrder: "sortOrder",
  defaultScriptId: "defaultScriptId",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var TestScriptScalarFieldEnum = {
  id: "id",
  testCaseId: "testCaseId",
  version: "version",
  steps: "steps",
  rawCode: "rawCode",
  createdAt: "createdAt"
};
var TestRunScalarFieldEnum = {
  id: "id",
  testCaseId: "testCaseId",
  scriptId: "scriptId",
  status: "status",
  startedAt: "startedAt",
  finishedAt: "finishedAt",
  logs: "logs",
  meta: "meta",
  createdAt: "createdAt"
};
var StepResultScalarFieldEnum = {
  id: "id",
  runId: "runId",
  stepIndex: "stepIndex",
  action: "action",
  status: "status",
  message: "message",
  durationMs: "durationMs",
  screenshot: "screenshot",
  consoleLog: "consoleLog",
  networkLog: "networkLog",
  healed: "healed",
  healedLocator: "healedLocator",
  createdAt: "createdAt"
};
var GenerationLogScalarFieldEnum = {
  id: "id",
  jobId: "jobId",
  projectId: "projectId",
  testCaseId: "testCaseId",
  status: "status",
  nl: "nl",
  startUrl: "startUrl",
  finishedAt: "finishedAt",
  totalUsage: "totalUsage",
  scriptSteps: "scriptSteps",
  error: "error",
  loopState: "loopState",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var GenerationStepScalarFieldEnum = {
  id: "id",
  logId: "logId",
  type: "type",
  stepIndex: "stepIndex",
  message: "message",
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
  args: "args",
  result: "result",
  error: "error",
  usage: "usage",
  createdAt: "createdAt"
};
var PluginScalarFieldEnum = {
  id: "id",
  name: "name",
  version: "version",
  description: "description",
  kind: "kind",
  entryFile: "entryFile",
  source: "source",
  builtin: "builtin",
  actions: "actions",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var PluginPresetScalarFieldEnum = {
  id: "id",
  name: "name",
  description: "description",
  builtin: "builtin",
  createdAt: "createdAt",
  updatedAt: "updatedAt"
};
var PluginPresetItemScalarFieldEnum = {
  id: "id",
  presetId: "presetId",
  pluginId: "pluginId",
  priority: "priority"
};
var SortOrder = {
  asc: "asc",
  desc: "desc"
};
var NullableJsonNullValueInput = {
  DbNull: DbNull2,
  JsonNull: JsonNull2
};
var JsonNullValueInput = {
  JsonNull: JsonNull2
};
var JsonNullValueFilter = {
  DbNull: DbNull2,
  JsonNull: JsonNull2,
  AnyNull: AnyNull2
};
var QueryMode = {
  default: "default",
  insensitive: "insensitive"
};
var NullsOrder = {
  first: "first",
  last: "last"
};
var defineExtension = runtime2.Extensions.defineExtension;

// generated/prisma/client.ts
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
var PrismaClient = getPrismaClientClass();

// src/db.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// src/migrate.ts
import Database from "better-sqlite3";
function quoteIdent(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}
function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  return cols.some((c) => c.name === column);
}
function addColumn(db, table, column, def) {
  if (columnExists(db, table, column)) return;
  db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(column)} ${def};`);
}
var MIGRATIONS = [
  {
    name: "20260721022429_add_step_result_logs",
    run: (db) => {
      addColumn(db, "StepResult", "consoleLog", "TEXT");
      addColumn(db, "StepResult", "networkLog", "TEXT");
    }
  },
  {
    name: "20260723100000_add_env_vars",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "EnvVar" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "projectId" TEXT NOT NULL,
            "key" TEXT NOT NULL,
            "value" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EnvVar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "EnvVar_projectId_key_key" ON "EnvVar"("projectId", "key");
        CREATE INDEX IF NOT EXISTS "EnvVar_projectId_idx" ON "EnvVar"("projectId");
      `);
    }
  },
  {
    name: "20260727000000_add_step_result_healed_locator",
    run: (db) => {
      addColumn(db, "StepResult", "healedLocator", "TEXT");
    }
  },
  {
    name: "20260811000000_add_test_case_sort_order",
    run: (db) => {
      addColumn(db, "TestCase", "sortOrder", "INTEGER NOT NULL DEFAULT 0");
    }
  },
  {
    name: "20260804000000_add_login_configs",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "LoginConfig" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "projectId" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "storageState" TEXT NOT NULL,
            "isDefault" BOOLEAN NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "LoginConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "LoginConfig_projectId_idx" ON "LoginConfig"("projectId");
      `);
    }
  },
  {
    name: "20260820000000_add_test_case_default_script",
    run: (db) => {
      addColumn(db, "TestCase", "defaultScriptId", "TEXT");
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "TestCase_defaultScriptId_key" ON "TestCase"("defaultScriptId");`);
    }
  },
  {
    name: "20260901000000_add_plugin_presets",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "Plugin" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "version" TEXT NOT NULL DEFAULT '1.0.0',
            "description" TEXT,
            "kind" TEXT NOT NULL DEFAULT 'inpage',
            "entryFile" TEXT NOT NULL,
            "source" TEXT NOT NULL DEFAULT 'upload',
            "builtin" BOOLEAN NOT NULL DEFAULT false,
            "actions" JSONB,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "Plugin_name_key" ON "Plugin"("name");
        CREATE INDEX IF NOT EXISTS "Plugin_source_idx" ON "Plugin"("source");

        CREATE TABLE IF NOT EXISTS "PluginPreset" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "builtin" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "PluginPreset_name_key" ON "PluginPreset"("name");

        CREATE TABLE IF NOT EXISTS "PluginPresetItem" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "presetId" TEXT NOT NULL,
            "pluginId" TEXT NOT NULL,
            "priority" INTEGER NOT NULL,
            CONSTRAINT "PluginPresetItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PluginPreset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "PluginPresetItem_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "PluginPresetItem_presetId_pluginId_key" ON "PluginPresetItem"("presetId", "pluginId");
        CREATE INDEX IF NOT EXISTS "PluginPresetItem_presetId_priority_idx" ON "PluginPresetItem"("presetId", "priority");
      `);
      addColumn(db, "Project", "presetId", "TEXT");
    }
  },
  {
    name: "20260817000000_add_generation_logs",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS "GenerationLog" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "jobId" TEXT NOT NULL,
            "projectId" TEXT,
            "testCaseId" TEXT,
            "status" TEXT NOT NULL DEFAULT 'RUNNING',
            "nl" TEXT NOT NULL,
            "startUrl" TEXT,
            "finishedAt" DATETIME,
            "totalUsage" TEXT,
            "scriptSteps" TEXT,
            "error" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "GenerationLog_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "GenerationLog_jobId_key" ON "GenerationLog"("jobId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_testCaseId_idx" ON "GenerationLog"("testCaseId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_projectId_idx" ON "GenerationLog"("projectId");
        CREATE INDEX IF NOT EXISTS "GenerationLog_createdAt_idx" ON "GenerationLog"("createdAt");

        CREATE TABLE IF NOT EXISTS "GenerationStep" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "logId" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "stepIndex" INTEGER,
            "message" TEXT,
            "system" TEXT,
            "user" TEXT,
            "assistant" TEXT,
            "tool" TEXT,
            "args" TEXT,
            "result" TEXT,
            "error" TEXT,
            "usage" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "GenerationStep_logId_fkey" FOREIGN KEY ("logId") REFERENCES "GenerationLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX IF NOT EXISTS "GenerationStep_logId_createdAt_idx" ON "GenerationStep"("logId", "createdAt");
      `);
    }
  },
  {
    name: "20260901010000_add_generation_log_loop_state",
    run: (db) => {
      addColumn(db, "GenerationLog", "loopState", "JSONB");
    }
  },
  {
    name: "20260903000000_add_project_viewport",
    run: (db) => {
      addColumn(db, "Project", "viewport", "JSONB");
    }
  }
];
function resolveDbPath(url) {
  let p = url.startsWith("file:") ? url.slice("file:".length) : url;
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p;
}
function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL \u672A\u8BBE\u7F6E\uFF0C\u65E0\u6CD5\u8FC1\u79FB SQLite \u5E93");
  const dbPath = resolveDbPath(url);
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "applied_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const applied = new Set(
      db.prepare(`SELECT name FROM "_app_migrations"`).all().map((r) => r.name)
    );
    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) continue;
      const tx = db.transaction(() => {
        m.run(db);
        db.prepare(`INSERT INTO "_app_migrations" ("name") VALUES (?)`).run(m.name);
      });
      tx();
    }
  } finally {
    db.close();
  }
}

// src/db.ts
runMigrations();
var adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
var prisma = new PrismaClient({ adapter });

// src/services/componentPlugins/builtin.ts
import { readFileSync } from "fs";
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var DEFAULT_PRESET_NAME = "\u9ED8\u8BA4\u7EC4\u5408";
var MODULE_DIR = path2.dirname(fileURLToPath2(import.meta.url));
function loadSource(name) {
  const file = path2.join(MODULE_DIR, "sources", `${name}.js`);
  try {
    return readFileSync(file, "utf-8");
  } catch {
    throw new Error(`\u5185\u7F6E\u63D2\u4EF6\u6E90\u7801\u7F3A\u5931\uFF1A${file}\uFF08dev \u4F4D\u4E8E src/services/componentPlugins/sources/\uFF1B\u6784\u5EFA\u4EA7\u7269\u987B\u968F dist/sources/ \u5206\u53D1\uFF09`);
  }
}
var SELECT_ACTION_DOC = "\u5728\u4E0B\u62C9\u4E2D\u9009\u62E9\u9009\u9879\uFF08\u81EA\u52A8\u6253\u5F00\u5F39\u5C42\u5E76\u70B9\u51FB\u6587\u672C/\u6807\u9898\u5339\u914D\u9879\uFF0C\u652F\u6301 Ant Design\u3001Element\u3001Vant \u4E0E MUI\uFF1B\u539F\u751F <select> \u7531\u5206\u53D1\u5668\u539F\u751F\u4EA4\u4E92\u5C42\u515C\u5E95 selectOption\uFF1B\u6811\u5F62\u9009\u62E9\u5668\uFF08TreeSelect/\u6811\u5F62\u4E0B\u62C9\uFF09\u540C\u6837\u7528\u672C\u52A8\u4F5C\uFF0Cvalue \u4F20\u76EE\u6807\u8282\u70B9\u53EF\u89C1\u6587\u672C\uFF0C\u6811\u5F62\u5F39\u5C42\u7531 tree-select \u7CFB\u5217\u5185\u7F6E\u63D2\u4EF6\u515C\u5E95\u95ED\u73AF\uFF1B\u7EA7\u8054\u9009\u62E9\u5668\uFF08Cascader\uFF09\u7528\u672C\u52A8\u4F5C\u65F6 value \u4F20\u5B8C\u6574\u8DEF\u5F84\u300CA / B / C\u300D\u9010\u7EA7\u5C55\u5F00\u70B9\u9009\uFF1BVant \u4E0B\u62C9\u83DC\u5355\u4E0E\u6EDA\u8F6E\u9009\u62E9\u5F39\u5C42\u3001MUI Select \u4E0E Autocomplete \u540C\u6837\u7528\u672C\u52A8\u4F5C\uFF09\u3002args.value=\u9009\u9879\u53EF\u89C1\u6587\u672C\u6216\u5B8C\u6574\u8DEF\u5F84";
var SET_DATE_ACTION_DOC = "\u8BBE\u7F6E\u7EC4\u4EF6\u5E93\u65E5\u671F\u9009\u62E9\u5668\uFF08fill \u4F18\u5148\uFF0C\u5931\u8D25\u8D70\u9762\u677F\u7FFB\u9875\u4E0E\u65E5\u671F\u683C\u70B9\u51FB\uFF1B\u65E5\u671F\u65F6\u95F4\u9009\u62E9\u5668\u81EA\u52A8\u70B9\u51FB\u786E\u8BA4/\u786E\u5B9A\u6309\u94AE\u63D0\u4EA4\uFF0C\u652F\u6301 Ant Design \u4E0E Element\uFF1BVant \u65E5\u671F\u6EDA\u8F6E/\u65E5\u5386\u9762\u677F\u4E3A\u53EA\u8BFB\u89E6\u53D1\u5668\uFF0C\u76F4\u63A5\u8D70\u5F39\u5C42\u70B9\u9009+\u786E\u8BA4\uFF09\u3002args.value=YYYY-MM-DD\uFF08\u65E5\u671F\u65F6\u95F4\u9009\u62E9\u5668\u81EA\u52A8\u8865 00:00:00\uFF0C\u4E5F\u53EF\u663E\u5F0F\u5E26 HH:mm(:ss)\uFF09";
var SET_TIME_ACTION_DOC = "\u8BBE\u7F6E\u7EC4\u4EF6\u5E93\u65F6\u95F4\u9009\u62E9\u5668\uFF08fill \u4F18\u5148\uFF1B\u9762\u677F\u515C\u5E95\u81EA\u52A8\u70B9\u683C\u5E76\u63D0\u4EA4\uFF1B12 \u5C0F\u65F6\u5236\u9762\u677F\u8BF7\u76F4\u63A5 fill \u5B8C\u6574\u65F6\u95F4\uFF0C\u652F\u6301 Ant Design \u4E0E Element\uFF1BVant \u65F6\u95F4\u6EDA\u8F6E\u4E3A\u53EA\u8BFB\u89E6\u53D1\u5668\uFF0C\u76F4\u63A5\u8D70\u5F39\u5C42\u9010\u5217\u70B9\u9009+\u786E\u8BA4\uFF09\u3002args.value=HH:mm(:ss)";
var SET_VALUE_ACTION_DOC = '\u8BBE\u7F6E\u6ED1\u5757\uFF08Slider\uFF09\u6570\u503C\uFF08\u4EC5\u9002\u7528\u4E8E\u6ED1\u5757\u7EC4\u4EF6\uFF0C\u52FF\u7528\u4E8E\u6B65\u8FDB\u5668/\u8BC4\u5206/\u5F00\u5173\u7B49\u5176\u5B83\u6570\u503C\u63A7\u4EF6\uFF1B\u62D6\u62FD\u624B\u67C4\u5BF9\u9F50\uFF0CAnt Design \u4E0E Element \u53E6\u652F\u6301\u952E\u76D8\u5FAE\u8C03\uFF1B\u8303\u56F4\u6ED1\u5757 args.value \u4F20 "a,b" \u8BBE\u4E24\u7AEF\uFF0C\u5355\u503C\u79FB\u52A8\u6700\u8FD1\u624B\u67C4\uFF1B\u53D7\u6B65\u957F\u9650\u5236\u8BF7\u4F20\u6B65\u957F\u6574\u6570\u500D\u7684\u503C\uFF0C\u652F\u6301 Ant Design\u3001Element\u3001Vant \u4E0E MUI\uFF09\u3002args.value=\u6570\u503C\u6216"a,b"';
var BUILTIN_PLUGIN_DEFS = [
  {
    name: "ant-select",
    version: "1.2.0",
    description: "Ant Design \u4E0B\u62C9\u9009\u62E9\u9002\u914D\uFF08\u517C\u5BB9 antd v5/v6 \u89E6\u53D1\u5668 DOM\uFF09\uFF1Aselect \u52A8\u4F5C\uFF08\u539F\u751F <select> \u7531\u5206\u53D1\u5668\u539F\u751F\u5C42\u515C\u5E95\uFF09\u3001combobox \u8BED\u4E49\u5019\u9009\u4E0E\u300C\u52FF fill\u300D\u6807\u6CE8\uFF08\u5185\u7F6E\uFF09\u3002\u5F39\u5C42\u5DF2\u5F00\u4E14\u5F52\u5C5E\u672C\u63A7\u4EF6\u65F6\u590D\u7528\uFF0C\u4ED6\u4EBA\u6B8B\u7559\u5148\u6536\u8D77\u518D\u6253\u5F00\uFF1B\u591A\u9009\u6A21\u5F0F\u9009\u4E2D\u540E\u81EA\u52A8\u6536\u8D77\u5F39\u5C42",
    entryFile: loadSource("ant-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "el-select",
    version: "1.0.0",
    description: "Element\uFF08element-ui / element-plus\uFF09\u4E0B\u62C9\u9009\u62E9\u9002\u914D\uFF1Aselect \u52A8\u4F5C\uFF08\u539F\u751F <select> \u7531\u5206\u53D1\u5668\u539F\u751F\u5C42\u515C\u5E95\uFF09\u3001combobox \u8BED\u4E49\u5019\u9009\u4E0E\u300C\u52FF fill\u300D\u6807\u6CE8\uFF08\u5185\u7F6E\uFF09\u3002\u5F39\u5C42\u5DF2\u5F00\u65F6\u590D\u7528\uFF1B\u591A\u9009\u6A21\u5F0F\u9009\u4E2D\u540E\u81EA\u52A8\u6536\u8D77\u5F39\u5C42",
    entryFile: loadSource("el-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "ant-tree-select",
    version: "1.0.1",
    description: "Ant Design \u6811\u5F62\u9009\u62E9\u5668\uFF08TreeSelect\uFF09\u9002\u914D\uFF08\u517C\u5BB9 antd v5/v6\uFF09\uFF1Aselect \u52A8\u4F5C\u515C\u5E95\uFF08\u5C55\u5F00\u7956\u5148\u95ED\u73AF + \u6811\u8282\u70B9\u6587\u672C\u5339\u914D\uFF09\uFF0C\u6392\u5728 ant-select \u4E4B\u540E\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("ant-tree-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "el-tree-select",
    version: "1.0.0",
    description: "Element \u6811\u5F62\u4E0B\u62C9\u9002\u914D\uFF08element-plus el-tree-select / element-ui \u7EC4\u5408\u65B9\u6848\uFF09\uFF1Aselect \u52A8\u4F5C\u515C\u5E95\uFF08\u5C55\u5F00\u7956\u5148\u95ED\u73AF + \u6811\u8282\u70B9\u6587\u672C\u5339\u914D\uFF09\uFF0C\u6392\u5728 el-select \u4E4B\u540E\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("el-tree-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "ant-date-picker",
    version: "1.3.0",
    description: "Ant Design \u65E5\u671F\u9009\u62E9\u5668\u9002\u914D\uFF1Aset_date \u52A8\u4F5C\uFF08fill \u4F18\u5148\uFF0C\u5931\u8D25\u8D70\u9762\u677F\u7FFB\u9875\u4E0E\u65E5\u671F\u683C\u70B9\u51FB\uFF1BshowTime/\u65E5\u671F\u65F6\u95F4\u5F62\u6001\u81EA\u52A8\u70B9\u51FB\u786E\u8BA4\u6309\u94AE\u63D0\u4EA4\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("ant-date-picker"),
    actionsMeta: [{ name: "set_date", doc: SET_DATE_ACTION_DOC, preferFill: true }]
  },
  {
    name: "el-date-picker",
    version: "1.3.0",
    description: "Element\uFF08element-ui / element-plus\uFF09\u65E5\u671F\u9009\u62E9\u5668\u9002\u914D\uFF1Aset_date \u52A8\u4F5C\uFF08fill \u4F18\u5148\uFF0C\u5931\u8D25\u8D70\u9762\u677F\u7FFB\u9875\u4E0E\u65E5\u671F\u683C\u70B9\u51FB\uFF1Bdatetime \u5F62\u6001\u81EA\u52A8\u70B9\u51FB\u786E\u5B9A\u6309\u94AE\u63D0\u4EA4\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("el-date-picker"),
    actionsMeta: [{ name: "set_date", doc: SET_DATE_ACTION_DOC, preferFill: true }]
  },
  {
    name: "ant-slider",
    version: "1.0.0",
    description: 'Ant Design \u6ED1\u5757\uFF08Slider\uFF09\u9002\u914D\uFF1Aset_value \u52A8\u4F5C\uFF08\u624B\u67C4\u62D6\u62FD+\u952E\u76D8\u5FAE\u8C03\u5BF9\u9F50\uFF1B\u8303\u56F4\u6ED1\u5757\u4F20 "a,b" \u8BBE\u4E24\u7AEF\uFF0C\u5355\u503C\u79FB\u52A8\u6700\u8FD1\u624B\u67C4\uFF1B\u5782\u76F4\u6ED1\u5757\u652F\u6301\uFF09\uFF08\u5185\u7F6E\uFF09',
    entryFile: loadSource("ant-slider"),
    actionsMeta: [{ name: "set_value", doc: SET_VALUE_ACTION_DOC, label: "\u6ED1\u5757\u8BBE\u7F6E", preferFill: false }]
  },
  {
    name: "el-slider",
    version: "1.0.0",
    description: 'Element\uFF08element-ui / element-plus\uFF09\u6ED1\u5757\uFF08Slider\uFF09\u9002\u914D\uFF1Aset_value \u52A8\u4F5C\uFF08\u624B\u67C4\u62D6\u62FD+\u952E\u76D8\u5FAE\u8C03\u5BF9\u9F50\uFF1B\u8303\u56F4\u6ED1\u5757\u4F20 "a,b" \u8BBE\u4E24\u7AEF\uFF0C\u5355\u503C\u79FB\u52A8\u6700\u8FD1\u624B\u67C4\uFF1B\u5782\u76F4\u6ED1\u5757\u652F\u6301\uFF09\uFF08\u5185\u7F6E\uFF09',
    entryFile: loadSource("el-slider"),
    actionsMeta: [{ name: "set_value", doc: SET_VALUE_ACTION_DOC, label: "\u6ED1\u5757\u8BBE\u7F6E", preferFill: false }]
  },
  {
    name: "ant-time-picker",
    version: "1.0.0",
    description: "Ant Design \u65F6\u95F4\u9009\u62E9\u5668\uFF08TimePicker\uFF09\u9002\u914D\uFF1Aset_time \u52A8\u4F5C\uFF08fill \u4F18\u5148\uFF0C\u9762\u677F\u515C\u5E95\u81EA\u52A8\u70B9\u683C\u5E76\u6309 Enter \u63D0\u4EA4\u2014\u2014antd 5.x \u9762\u677F\u65E0\u786E\u5B9A\u6309\u94AE\u3001\u70B9\u683C\u4EC5\u5F85\u5B9A\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("ant-time-picker"),
    actionsMeta: [{ name: "set_time", doc: SET_TIME_ACTION_DOC, label: "\u8BBE\u7F6E\u65F6\u95F4", preferFill: true }]
  },
  {
    name: "el-time-picker",
    version: "1.0.0",
    description: "Element\uFF08element-ui / element-plus\uFF09\u65F6\u95F4\u9009\u62E9\u5668\uFF08TimePicker\uFF09\u9002\u914D\uFF1Aset_time \u52A8\u4F5C\uFF08\u9762\u677F\u70B9\u9009\u6EDA\u8F6E\u5E76\u70B9\u786E\u5B9A\u6309\u94AE\u63D0\u4EA4\uFF1Bfill+Enter \u5728 element-plus \u4E0D\u53EF\u9760\u6545\u4E0D\u8D70\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("el-time-picker"),
    actionsMeta: [{ name: "set_time", doc: SET_TIME_ACTION_DOC, label: "\u8BBE\u7F6E\u65F6\u95F4", preferFill: false }]
  },
  {
    name: "ant-cascader",
    version: "1.0.1",
    description: "Ant Design \u7EA7\u8054\u9009\u62E9\u5668\uFF08Cascader\uFF09\u9002\u914D\uFF08\u517C\u5BB9 antd v5/v6\uFF09\uFF1Aselect \u52A8\u4F5C\uFF08\u81EA\u52A8\u5F00\u5F39\u5C42\u5E76\u9010\u7EA7\u5C55\u5F00\u70B9\u9009\u5B8C\u6574\u8DEF\u5F84\uFF1B\u591A\u9009\u6A21\u5F0F\u52FE\u9009\u540E\u81EA\u52A8\u6536\u8D77\u5F39\u5C42\uFF0C\u52FE\u7236\u7EA7\u5373\u5168\u9009\u5B50\u7EA7\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("ant-cascader"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "el-cascader",
    version: "1.0.0",
    description: "Element\uFF08element-ui / element-plus\uFF09\u7EA7\u8054\u9009\u62E9\u5668\uFF08Cascader\uFF09\u9002\u914D\uFF1Aselect \u52A8\u4F5C\uFF08\u81EA\u52A8\u5F00\u5F39\u5C42\u5E76\u9010\u7EA7\u5C55\u5F00\u70B9\u9009\u5B8C\u6574\u8DEF\u5F84\uFF1B\u591A\u9009\u6A21\u5F0F\u52FE\u9009\u540E\u81EA\u52A8\u6536\u8D77\u5F39\u5C42\uFF0C\u52FE\u7236\u7EA7\u5373\u5168\u9009\u5B50\u7EA7\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("el-cascader"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "vant-select",
    version: "1.0.0",
    description: "Vant \u4E0B\u62C9\u83DC\u5355\uFF08van-dropdown-menu\uFF09\u9002\u914D\uFF1Aselect \u52A8\u4F5C\uFF08\u70B9\u6807\u9898\u5C55\u5F00 overlay \u9009\u9879\u5E76\u70B9\u51FB\u6587\u672C\u5339\u914D\u9879\uFF0C\u9009\u4E2D\u540E\u81EA\u52A8\u6536\u8D77\u5F39\u5C42\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("vant-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "vant-picker",
    version: "1.0.0",
    description: "Vant \u6EDA\u8F6E\u9009\u62E9\u5F39\u5C42\uFF08\u53EA\u8BFB van-field + van-picker \u5BB6\u65CF\uFF1A\u7EAF\u9009\u9879/\u65E5\u671F/\u65F6\u95F4\u6EDA\u8F6E\uFF09\u9002\u914D\uFF1Aselect/set_date/set_time \u52A8\u4F5C\uFF08\u5F39\u5C42\u5185\u9010\u5217\u70B9\u9009\u540E\u70B9\u786E\u8BA4\u63D0\u4EA4\uFF1B\u89E6\u53D1\u5668\u4FA7\u65E0\u5224\u522B\u4FE1\u606F\uFF0C\u52A8\u4F5C\u5185\u6309\u5217\u7ED3\u6784\u63A2\u6D4B\u7EC6\u5206\uFF0C\u4E0D\u7B26\u5373 failed \u843D\u94FE\u7531\u65E5\u5386/\u7EA7\u8054\u63D2\u4EF6\u515C\u5E95\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("vant-picker"),
    actionsMeta: [
      { name: "select", doc: SELECT_ACTION_DOC, preferFill: false },
      { name: "set_date", doc: SET_DATE_ACTION_DOC, preferFill: false },
      { name: "set_time", doc: SET_TIME_ACTION_DOC, label: "\u8BBE\u7F6E\u65F6\u95F4", preferFill: false }
    ]
  },
  {
    name: "vant-slider",
    version: "1.0.0",
    description: 'Vant \u6ED1\u5757\uFF08van-slider\uFF09\u9002\u914D\uFF1Aset_value \u52A8\u4F5C\uFF08\u624B\u67C4 touch \u62D6\u62FD\uFF08vant \u4EC5\u7ED1 touch \u4E8B\u4EF6\uFF09+ \u8F68\u9053\u70B9\u51FB\uFF1B\u8303\u56F4\u6ED1\u5757\u4F20 "a,b" \u8BBE\u4E24\u7AEF\uFF0C\u5355\u503C\u79FB\u52A8\u6700\u8FD1\u624B\u67C4\uFF1B\u5782\u76F4\u6ED1\u5757\u652F\u6301\uFF09\uFF08\u5185\u7F6E\uFF09',
    entryFile: loadSource("vant-slider"),
    actionsMeta: [{ name: "set_value", doc: SET_VALUE_ACTION_DOC, label: "\u6ED1\u5757\u8BBE\u7F6E", preferFill: false }]
  },
  {
    name: "mui-select",
    version: "1.0.0",
    description: "Material-UI \u4E0B\u62C9\u9002\u914D\uFF08Select \u975E\u539F\u751F\u4E0B\u62C9 + Autocomplete \u81EA\u52A8\u8865\u5168\uFF09\uFF1Aselect \u52A8\u4F5C\uFF08Select \u70B9\u5F00 listbox \u70B9\u5339\u914D\u9879\uFF1BAutocomplete \u8F93\u5165\u8FC7\u6EE4\u540E\u9009\u4E2D\uFF1BNativeSelect \u4E3A\u539F\u751F select \u7531\u5206\u53D1\u5668\u515C\u5E95\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("mui-select"),
    actionsMeta: [{ name: "select", doc: SELECT_ACTION_DOC, preferFill: false }]
  },
  {
    name: "mui-slider",
    version: "1.0.0",
    description: 'Material-UI \u6ED1\u5757\uFF08Slider\uFF09\u9002\u914D\uFF1Aset_value \u52A8\u4F5C\uFF08\u624B\u67C4\u62D6\u62FD\u5B9A\u4F4D\uFF08\u5408\u6210 mousemove \u987B\u5E26 buttons:1\uFF09\uFF1BARIA \u5728\u624B\u67C4\u5185 input \u4E0A\uFF1B\u8303\u56F4\u6ED1\u5757\u4F20 "a,b" \u8BBE\u4E24\u7AEF\uFF0C\u5355\u503C\u79FB\u52A8\u6700\u8FD1\u624B\u67C4\uFF09\uFF08\u5185\u7F6E\uFF09',
    entryFile: loadSource("mui-slider"),
    actionsMeta: [{ name: "set_value", doc: SET_VALUE_ACTION_DOC, label: "\u6ED1\u5757\u8BBE\u7F6E", preferFill: false }]
  },
  {
    name: "vant-calendar",
    version: "1.0.0",
    description: "Vant \u65E5\u5386\uFF08van-calendar\uFF09\u9002\u914D\uFF1Aset_date \u52A8\u4F5C\uFF08\u76EE\u6807\u6708\u6309\u65B9\u5411\u6EDA\u52A8\u5B9A\u4F4D\uFF0C\u70B9\u65E5\u683C\u9009\u4E2D\u540E\u70B9\u786E\u8BA4\u6309\u94AE\u63D0\u4EA4\uFF1B\u4E0E vant-picker \u94FE\u5F0F\u534F\u4F5C\u2014\u2014\u6EDA\u8F6E\u63A2\u6D4B\u5931\u8D25\u843D\u94FE\u81F3\u6B64\u5E76\u590D\u7528\u5DF2\u5F00\u5F39\u5C42\uFF09\uFF08\u5185\u7F6E\uFF09",
    entryFile: loadSource("vant-calendar"),
    actionsMeta: [{ name: "set_date", doc: SET_DATE_ACTION_DOC, preferFill: false }]
  }
];
var BUILTIN_PRESET_MEMBERS = [
  "ant-select",
  "el-select",
  "ant-tree-select",
  "el-tree-select",
  "ant-date-picker",
  "el-date-picker",
  "ant-slider",
  "el-slider",
  "ant-time-picker",
  "el-time-picker",
  "ant-cascader",
  "el-cascader",
  "mui-select",
  "mui-slider",
  "vant-select",
  "vant-picker",
  "vant-calendar",
  "vant-slider"
];
var LEGACY_BUILTIN_NAMES = ["antd", "element-plus", "select", "tree-select", "date-picker"];

// src/shared/envVars.ts
var VAR_PATTERN = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\[?\s*:\s*(\d+)\s*\]?)?\s*\}\}/gu;
var LEGACY_SYSTEM_VAR_PATTERN = /\$\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\[?\s*:\s*(\d+)\s*\]?)?\}/gu;
var KNOWN_SYSTEM_NAMES = /* @__PURE__ */ new Set([
  "systemTime",
  "randomNumber",
  "randomChinese",
  "randomPhone",
  "randomEmail",
  "randomIdCard"
]);
function systemKey(name, param) {
  return param ? `${name}:${param}` : name;
}
var HANZI_POOL = "\u7684\u4E00\u662F\u5728\u4E0D\u4E86\u6709\u548C\u4EBA\u8FD9\u4E2D\u5927\u4E3A\u4E0A\u4E2A\u56FD\u6211\u4EE5\u8981\u4ED6\u65F6\u6765\u7528\u4EEC\u751F\u5230\u4F5C\u5730\u4E8E\u51FA\u5C31\u5206\u5BF9\u6210\u4F1A\u53EF\u4E3B\u53D1\u5E74\u52A8\u540C\u5DE5\u4E5F\u80FD\u4E0B\u8FC7\u5B50\u8BF4\u4EA7\u79CD\u9762\u800C\u65B9\u540E\u591A\u5B9A\u884C\u5B66\u6CD5\u6240\u6C11\u5F97\u7ECF\u5341\u4E09\u4E4B\u8FDB\u7740\u7B49\u90E8\u5EA6\u5BB6\u7535\u529B\u91CC\u5982\u6C34\u5316\u9AD8\u81EA\u4E8C\u7406\u8D77\u5C0F\u7269\u73B0\u5B9E\u52A0\u91CF\u90FD\u4E24\u4F53\u5236\u673A\u5F53\u4F7F\u70B9\u4ECE\u4E1A\u672C\u53BB\u628A\u6027\u597D\u5E94\u5F00\u5B83\u5408\u8FD8\u56E0\u7531\u5176\u4E9B\u7136\u524D\u5916\u5929\u653F\u56DB\u65E5\u90A3\u793E\u4E49\u4E8B\u5E73\u5F62\u76F8\u5168\u8868\u95F4\u6837\u4E0E\u5173\u5404\u91CD\u65B0\u7EBF\u5185\u6570\u6B63\u5FC3\u53CD\u4F60\u660E\u770B\u539F\u53C8\u4E48\u5229\u6BD4\u6216\u4F46\u8D28\u6C14\u7B2C\u5411\u9053\u547D\u6B64\u53D8\u6761\u53EA\u6CA1\u7ED3\u89E3\u95EE\u610F\u5EFA\u6708\u516C\u65E0\u7CFB\u519B\u5F88\u60C5\u8005\u6700\u7ACB\u4EE3\u60F3\u5DF2\u901A\u5E76\u63D0\u76F4\u9898\u515A\u7A0B\u5C55\u4E94\u679C\u6599\u8C61\u5458\u9769\u4F4D\u5165\u5E38\u6587\u603B\u6B21\u54C1\u5F0F\u6D3B\u8BBE\u53CA\u7BA1\u7279\u4EF6\u957F\u6C42\u8001\u5934\u57FA\u8D44\u8FB9\u6D41\u8DEF\u7EA7\u5C11\u56FE\u5C71\u7EDF\u63A5\u77E5\u8F83\u5C06\u7EC4\u89C1\u8BA1\u522B\u5979\u624B\u89D2\u671F\u6839\u8BBA\u8FD0\u519C\u6307\u51E0\u4E5D\u533A\u5F3A\u653E\u51B3\u897F\u88AB\u5E72\u505A\u5FC5\u6218\u5148\u56DE\u5219\u4EFB\u53D6\u636E\u5904\u961F\u5357\u7ED9\u8272\u5149\u95E8\u5373\u4FDD\u6CBB\u5317\u9020\u767E\u89C4\u70ED\u9886\u4E03\u6D77\u53E3\u4E1C\u5BFC\u5668\u538B\u5FD7\u4E16\u91D1\u589E\u4E89\u6D4E\u9636\u6CB9\u601D\u672F\u6781\u4EA4\u53D7\u8054\u4EC0\u8BA4\u516D\u5171\u6743\u6536\u8BC1\u6539\u6E05\u5DF1\u7F8E\u518D\u91C7\u8F6C\u66F4\u5355\u98CE\u5207\u6253\u767D\u6559\u901F\u82B1\u5E26\u5B89\u573A\u8EAB\u8F66\u4F8B\u771F\u52A1\u5177\u4E07\u6BCF\u76EE\u81F3\u8FBE\u8D70\u79EF\u793A\u8BAE\u58F0\u62A5\u6597\u5B8C\u7C7B\u516B\u79BB\u534E\u540D\u786E\u624D\u79D1\u5F20\u4FE1\u9A6C\u8282\u8BDD\u7C73\u6574\u7A7A\u5143\u51B5\u4ECA\u96C6\u6E29\u4F20\u571F\u8BB8\u6B65\u7FA4\u5E7F\u77F3\u8BB0\u9700\u6BB5\u7814\u754C\u62C9\u6797\u5F8B\u53EB\u4E14\u7A76\u89C2\u8D8A\u7EC7\u88C5\u5F71\u7B97\u4F4E\u6301\u97F3\u4F17\u4E66\u5E03\u590D\u5BB9\u513F\u987B\u9645\u5546\u975E\u9A8C\u8FDE\u65AD\u6DF1\u96BE\u8FD1\u77FF\u5343\u5468\u59D4\u7D20\u6280\u5907\u534A\u529E\u9752\u7701\u5217\u4E60\u54CD\u7EA6\u652F\u822C\u53F2\u611F\u52B3\u4FBF\u56E2\u5F80\u9178\u5386\u5E02\u514B\u4F55\u9664\u6D88\u6784\u5E9C\u79F0\u592A\u51C6\u7CBE\u503C\u53F7\u7387\u65CF\u7EF4\u5212\u9009\u6807\u5199\u5B58\u5019\u6BDB\u4EB2\u5FEB\u6548\u65AF\u9662\u67E5\u6C5F\u578B\u773C\u738B\u6309\u683C\u517B\u6613\u7F6E\u6D3E\u5C42\u7247\u59CB\u5374\u4E13\u72B6\u80B2\u5382\u4EAC\u8BC6\u9002\u5C5E\u5706\u5305\u706B\u4F4F\u8C03\u6EE1\u53BF\u5C40\u7167\u53C2\u7EA2\u7EC6\u5F15\u542C\u8BE5\u94C1\u4EF7\u4E25\u9F99\u98DE";
function randomDigits(len) {
  const n = Math.max(1, Math.floor(len));
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
}
function randomHanzi(len) {
  const n = Math.max(1, Math.floor(len));
  let out = "";
  for (let i = 0; i < n; i++) out += HANZI_POOL[Math.floor(Math.random() * HANZI_POOL.length)];
  return out;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomPhone() {
  return `1${randInt(3, 9)}${randomDigits(9)}`;
}
function randomEmail() {
  const LOCAL_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const localLen = randInt(6, 12);
  let local = "";
  for (let i = 0; i < localLen; i++) local += LOCAL_CHARS[Math.floor(Math.random() * LOCAL_CHARS.length)];
  const domains = ["qq.com", "163.com", "126.com", "gmail.com", "outlook.com", "example.com"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${local}@${domain}`;
}
var ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
var ID_CARD_CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
function randomIdCard() {
  const region = `${randInt(11, 82)}${randomDigits(2)}${randomDigits(2)}`;
  const year = randInt(1950, 2005);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  const birthday = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  const seq = randomDigits(3);
  const base = `${region}${birthday}${seq}`;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(base[i]) * ID_CARD_WEIGHTS[i];
  const check = ID_CARD_CHECK_CODES[sum % 11];
  return `${base}${check}`;
}
function systemValue(key, now) {
  const [name, param] = key.split(":");
  switch (name) {
    case "systemTime":
      return String(now);
    case "randomNumber":
      return randomDigits(param ? Number(param) : 6);
    case "randomChinese":
      return randomHanzi(param ? Number(param) : 2);
    case "randomPhone":
      return randomPhone();
    case "randomEmail":
      return randomEmail();
    case "randomIdCard":
      return randomIdCard();
    default:
      return key;
  }
}
function collectSystemKeys(texts) {
  const keys = [];
  const seen = /* @__PURE__ */ new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const pattern of [VAR_PATTERN, LEGACY_SYSTEM_VAR_PATTERN]) {
      for (const m of t.matchAll(pattern)) {
        if (!KNOWN_SYSTEM_NAMES.has(m[1])) continue;
        const key = systemKey(m[1], m[2]);
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
  }
  return keys;
}
function resolveSystemKeys(keys, now = Date.now()) {
  const out = {};
  for (const key of keys) out[key] = systemValue(key, now);
  return out;
}
function resolveSystemVars(texts, now = Date.now()) {
  return resolveSystemKeys(collectSystemKeys(texts), now);
}
function substituteAll(text, vars, sysVars, missing) {
  if (text == null) return void 0;
  const unified = text.replace(VAR_PATTERN, (full, name, param) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    const key = systemKey(name, param);
    if (Object.prototype.hasOwnProperty.call(sysVars, key)) return sysVars[key];
    if (!KNOWN_SYSTEM_NAMES.has(name)) missing?.add(name);
    return full;
  });
  return unified.replace(LEGACY_SYSTEM_VAR_PATTERN, (full, name, param) => {
    const key = systemKey(name, param);
    return Object.prototype.hasOwnProperty.call(sysVars, key) ? sysVars[key] : full;
  });
}
function legacyToUnifiedSystemVars(text) {
  if (text == null) return void 0;
  return text.replace(LEGACY_SYSTEM_VAR_PATTERN, (full, name, param) => {
    if (!KNOWN_SYSTEM_NAMES.has(name)) return full;
    return param ? `{{${name}[:${param}]}}` : `{{${name}}}`;
  });
}
var VAR_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function isValidVarName(name) {
  return VAR_NAME_RE.test(name);
}

// src/shared/viewport.ts
var VIEWPORT_MIN = 100;
var VIEWPORT_MAX = 7680;
var preset = (group, label, width, height) => ({
  key: `${width}x${height}`,
  label,
  group,
  width,
  height
});
var VIEWPORT_PRESETS = [
  // 常用桌面分辨率
  preset("desktop", "", 1280, 720),
  preset("desktop", "", 1366, 768),
  preset("desktop", "", 1440, 900),
  preset("desktop", "", 1536, 864),
  preset("desktop", "", 1680, 1050),
  preset("desktop", "", 1920, 1080),
  preset("desktop", "", 2560, 1440),
  // 手机（尺寸为 CSS 像素）
  preset("phone", "iPhone SE", 375, 667),
  preset("phone", "iPhone 13 / 14", 390, 844),
  preset("phone", "iPhone 15 / 16", 393, 852),
  preset("phone", "iPhone 14 Pro Max", 430, 932),
  preset("phone", "iPhone 16 Pro Max", 440, 956),
  preset("phone", "Pixel 7", 412, 915),
  preset("phone", "Galaxy S8+", 360, 740),
  // 平板
  preset("tablet", "iPad Mini", 768, 1024),
  preset("tablet", "iPad Air", 820, 1180),
  preset("tablet", "iPad Pro 11", 834, 1194),
  preset("tablet", "iPad Pro 12.9", 1024, 1366),
  preset("tablet", "Surface Pro 7", 912, 1368)
];
function clampSide(v) {
  return Math.min(VIEWPORT_MAX, Math.max(VIEWPORT_MIN, Math.floor(v)));
}
function parseViewport(v) {
  if (v == null) return null;
  if (typeof v !== "object" || Array.isArray(v)) return void 0;
  const { width, height } = v;
  if (typeof width !== "number" || !Number.isFinite(width)) return void 0;
  if (typeof height !== "number" || !Number.isFinite(height)) return void 0;
  return { width: clampSide(width), height: clampSide(height) };
}
function readViewport(v) {
  let val = v;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return null;
    }
  }
  const parsed = parseViewport(val);
  return parsed === void 0 ? null : parsed;
}

// src/routes/runs.ts
import { randomUUID } from "crypto";
import fs3 from "fs";
import path5 from "path";

// src/services/runnerService.ts
import { chromium as chromium3 } from "playwright";
import path4 from "path";

// src/services/stagehandManager.ts
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import OpenAI from "openai";
import { chromium as chromium2 } from "playwright-core";
import { createServer } from "net";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join as join3 } from "path";

// src/config.ts
import fs from "fs";
import path3 from "path";
var REASONING_EFFORTS = ["", "low", "high", "max"];
var DEFAULT_SPLIT_SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u540D\u8D44\u6DF1 Web \u6D4B\u8BD5\u5DE5\u7A0B\u5E08\u3002\u7528\u6237\u4F1A\u7ED9\u51FA\u4E00\u6761\u6D4B\u8BD5\u6D41\u7A0B\u7684\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF08\u53EF\u80FD\u9644\u6709\u9875\u9762\u622A\u56FE/\u89C6\u89C9\u8BF4\u660E\u4E0E\u9644\u4EF6\u5185\u5BB9\uFF09\uFF0C\u8BF7\u4F60\u636E\u6B64\u628A\u6574\u4E2A\u6D4B\u8BD5\u8FC7\u7A0B\u9884\u62C6\u5206\u4E3A\u4E00\u4EFD**\u6709\u5E8F\u7684\u53EF\u6267\u884C\u6B65\u9AA4\u8BA1\u5212**\uFF0C\u540E\u7EED\u4F1A\u5728\u771F\u5B9E\u6D4F\u89C8\u5668\u91CC\u9010\u6B65\u6267\u884C\u5E76\u56DE\u653E\u3002

\u8F93\u51FA\u8981\u6C42\uFF1A
- \u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u683C\u5F0F\u4E3A {"steps": [ ... ]}\uFF0C\u4E0D\u8981\u8F93\u51FA\u5176\u4ED6\u6587\u5B57\u6216 markdown \u56F4\u680F\u3002
- \u6BCF\u4E2A\u6B65\u9AA4\u662F\u4E00\u4E2A\u5BF9\u8C61\uFF1A
  \xB7 "kind": "action"\uFF08\u52A8\u4F5C\uFF09\u6216 "assert"\uFF08\u65AD\u8A00\uFF09\uFF0C\u5FC5\u586B\u3002
  \xB7 "instruction": \u7528\u81EA\u7136\u8BED\u8A00\u5199\u6E05\u300C\u64CD\u4F5C\u54EA\u4E2A\u5143\u7D20\u3001\u671F\u671B\u4EC0\u4E48\u300D\uFF0C\u5FC5\u586B\u3002\u8FD9\u662F\u540E\u7EED\u7528 act/observe \u5B9A\u4F4D\u4E0E\u56DE\u653E\u81EA\u6108\u7684\u4F9D\u636E\uFF0C\u8D8A\u5177\u4F53\u8D8A\u597D\uFF0C\u5982\u300C\u70B9\u51FB\u9875\u9762\u53F3\u4E0A\u89D2\u300E\u767B\u5F55\u300F\u6309\u94AE\u300D\u300C\u5728\u300E\u7528\u6237\u540D\u300F\u8F93\u5165\u6846\u8F93\u5165 admin\u300D\u300C\u65AD\u8A00\u9875\u9762\u53F3\u4E0A\u89D2\u663E\u793A\u7528\u6237\u540D admin\u300D\u3002
  \xB7 \u52A8\u4F5C\u6B65\uFF1A"action" \u53EF\u4E3A goto\uFF08\u9700\u5E26 "url"\uFF09\u3001wait\uFF08\u9700\u5E26 "value" \u6BEB\u79D2\u6570\uFF09\uFF1Bclick/fill/press/select/check \u7B49 UI \u52A8\u4F5C**\u5FC5\u987B\u5E26 "action" \u5B57\u6BB5**\uFF08fill/select \u9700\u5E26 "value" \u6307\u5B9A\u8981\u586B\u5165/\u9009\u4E2D\u7684\u503C\uFF0Cpress \u53EF\u5E26 "key"\uFF09\uFF0C\u4F46**\u4E0D\u8981\u63D0\u4F9B\u9009\u62E9\u5668**\u2014\u2014\u76EE\u6807\u5143\u7D20\u5199\u5728 instruction \u91CC\uFF0C\u6267\u884C\u65F6\u7531\u6D4F\u89C8\u5668\u81EA\u52A8\u5B9A\u4F4D\u3002select \u6B65\u7684 value \u5199\u76EE\u6807\u9009\u9879\u7684\u53EF\u89C1\u6587\u672C\uFF1B\u82E5\u4E0D\u786E\u5B9A\u9875\u9762\u5B9E\u9645\u6709\u54EA\u4E9B\u9009\u9879\uFF0C\u6309\u8BED\u4E49\u5199\u8FD1\u4F3C\u63CF\u8FF0\u5373\u53EF\u2014\u2014\u8BE5\u503C\u4EC5\u4F9B\u53C2\u8003\uFF0C\u6267\u884C Agent \u4F1A\u4EE5\u9875\u9762\u5B9E\u9645\u53EF\u9009\u5217\u8868\u4E3A\u51C6\u81EA\u52A8\u4FEE\u6B63\u3002
  \xB7 \u65AD\u8A00\u6B65\uFF1A"assertion" \u5BF9\u8C61\uFF1AUI \u65AD\u8A00\u7528 {"type":"visible"|"hidden"|"text","expected":"..."}\uFF0C\u76EE\u6807\u5143\u7D20\u5728 instruction \u91CC\u7528\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF08observe \u4F1A\u53BB\u5B9A\u4F4D\uFF09\uFF1B\u63A5\u53E3\u65AD\u8A00\u7528 {"type":"response_status"|"response_body"|"response_json","urlMatch":"/api/xxx","expected":"...","jsonPath":"data.id"}\uFF1BWebSocket \u65AD\u8A00\u7528 {"type":"ws_sent"|"ws_received","urlMatch":"/ws/xxx"}\u3002urlMatch \u662F URL \u5173\u952E\u8BCD\u5B50\u4E32\uFF0C\u4E0D\u662F\u5B8C\u6574 URL \u6216 CSS \u9009\u62E9\u5668\u3002
  \xB7 \u65AD\u8A00\u8BC1\u636E\u8981**\u6301\u4E45\u3001\u53EF\u590D\u73B0**\uFF1A\u4E0D\u8981\u65AD\u8A00 toast/\u6D6E\u5C42\u7B49\u51E0\u79D2\u540E\u81EA\u52A8\u6D88\u5931\u7684\u77AC\u6001\u63D0\u793A\uFF08\u5982\u300C\u767B\u5F55\u6210\u529F\u300D\u300C\u4FDD\u5B58\u6210\u529F\u300D\u300C\u53D1\u5E03\u6210\u529F\u300D\uFF09\u2014\u2014\u56DE\u653E\u65F6\u6781\u6613\u56E0\u63D0\u793A\u6D88\u5931\u65F6\u673A\u4E0D\u786E\u5B9A\u800C\u8BEF\u62A5\u5931\u8D25\u3002\u4F18\u5148\u65AD\u8A00**\u63A5\u53E3\u54CD\u5E94**\uFF08\u64CD\u4F5C\u57FA\u672C\u90FD\u6709\u5BF9\u5E94\u63A5\u53E3\uFF0Cresponse_status/response_json \u6700\u7A33\uFF09\uFF1B\u5176\u6B21\u65AD\u8A00**\u64CD\u4F5C\u540E\u7684\u6301\u4E45\u9875\u9762\u5185\u5BB9**\uFF08\u5217\u8868\u65B0\u589E\u7684\u884C\u3001\u8BE6\u60C5\u9875\u5B57\u6BB5\u3001\u8DF3\u8F6C\u540E\u7A33\u5B9A\u5C55\u793A\u7684\u5143\u7D20\uFF09\u3002\u82E5\u7ED3\u679C\u53EA\u80FD\u9760\u77AC\u6001\u63D0\u793A\u4F53\u73B0\uFF0C\u5C31\u6539\u65AD\u8A00\u5B83\u5E26\u6765\u7684\u6301\u4E45\u6548\u679C\uFF08\u5982\u5217\u8868/\u8BE6\u60C5\u51FA\u73B0\u65B0\u6570\u636E\u3001URL \u53D1\u751F\u8DF3\u8F6C\uFF09\u3002
- \u6B65\u9AA4\u6309\u7528\u6237\u64CD\u4F5C\u7684\u771F\u5B9E\u987A\u5E8F\u6392\u5217\uFF1B\u53EA\u4FDD\u7559\u4E0E\u6D4B\u8BD5\u76EE\u6807\u76F8\u5173\u7684\u6B65\u9AA4\uFF0C\u63A2\u67E5\u6027\u52A8\u4F5C\u4E0D\u8981\u3002
- \u9700\u8981\u552F\u4E00/\u968F\u673A\u6D4B\u8BD5\u6570\u636E\u7684\u5B57\u6BB5\uFF08\u4E34\u65F6\u7528\u6237\u540D\u3001\u7F16\u53F7\u3001\u6807\u9898\u3001\u624B\u673A\u53F7\u3001\u90AE\u7BB1\u3001\u8EAB\u4EFD\u8BC1\u7B49\uFF09\u628A\u7CFB\u7EDF\u53D8\u91CF\u62FC\u8FDB instruction/value \u91CC\uFF0C\u5199\u6CD5\u4E0E\u73AF\u5883\u53D8\u91CF\u76F8\u540C\u90FD\u662F\u53CC\u82B1\u62EC\u53F7\uFF1A{{systemTime}}\uFF08\u5F53\u524D\u65F6\u95F4\u6233\uFF09\u3001{{randomNumber[:n]}}\uFF08\u968F\u673A\u6570\u5B57\uFF09\u3001{{randomChinese[:n]}}\uFF08\u968F\u673A\u6C49\u5B57\uFF09\u3001{{randomPhone}}\uFF08\u968F\u673A\u624B\u673A\u53F7\uFF09\u3001{{randomEmail}}\uFF08\u968F\u673A\u90AE\u7BB1\uFF09\u3001{{randomIdCard}}\uFF08\u968F\u673A 18 \u4F4D\u8EAB\u4EFD\u8BC1\u53F7\uFF09\u3002\u7CFB\u7EDF\u53D8\u91CF\u662F\u8FD0\u884C\u671F\u5185\u7F6E\u7684\u3001\u65E0\u9700\u5728\u9879\u76EE\u91CC\u5B9A\u4E49\uFF1B\u53EA\u6709\u5F53\u9879\u76EE\u73AF\u5883\u53D8\u91CF\u6070\u597D\u5B9A\u4E49\u4E86\u540C\u540D\u53D8\u91CF\u65F6\u624D\u4EE5\u73AF\u5883\u53D8\u91CF\u4E3A\u51C6\u3002\u8DE8\u73AF\u5883\u590D\u7528\u7684\u503C\uFF08\u6839\u57DF\u540D\u3001\u901A\u7528\u8D26\u53F7\u5BC6\u7801\uFF09\u7528 {{\u53D8\u91CF\u540D}} \u5360\u4F4D\uFF08\u9700\u5728\u9879\u76EE\u8BBE\u7F6E\u91CC\u5B9A\u4E49\uFF09\uFF1B\u4E00\u6B21\u6027\u6D4B\u8BD5\u6570\u636E\u76F4\u63A5\u5199\u771F\u5B9E\u503C\u3002
- \u8BA1\u5212\u5FC5\u987B**\u4EE5\u4E00\u6761\u65AD\u8A00\u6B65\u9AA4\u7ED3\u5C3E**\uFF0C\u9A8C\u8BC1\u6D4B\u8BD5\u76EE\u6807\u5DF2\u8FBE\u6210\uFF08\u5173\u952E\u7ED3\u679C\u51FA\u73B0\u3001\u76EE\u6807\u9875\u9762\u5143\u7D20\u53EF\u89C1\u3001\u63A5\u53E3\u8FD4\u56DE\u6210\u529F\u7B49\uFF09\u3002

\u3010\u62C6\u6B65\u793A\u4F8B\u3011
\u8F93\u5165\u63CF\u8FF0\uFF1A\u5728\u7CFB\u7EDF\u91CC\u65B0\u589E\u4E00\u4E2A\u516C\u544A\u5E76\u9A8C\u8BC1\u53D1\u5E03\u6210\u529F\u3002
\u8F93\u51FA\uFF1A
{"steps":[
  {"kind":"action","action":"click","instruction":"\u70B9\u51FB\u5DE6\u4FA7\u83DC\u5355\u300C\u516C\u544A\u7BA1\u7406\u300D"},
  {"kind":"action","action":"click","instruction":"\u70B9\u51FB\u300C\u65B0\u5EFA\u516C\u544A\u300D\u6309\u94AE"},
  {"kind":"action","action":"fill","instruction":"\u5728\u300C\u6807\u9898\u300D\u8F93\u5165\u6846\u8F93\u5165 \u516C\u544A_{{randomNumber[:6]}}","value":"\u516C\u544A_{{randomNumber[:6]}}"},
  {"kind":"action","action":"fill","instruction":"\u5728\u300C\u5185\u5BB9\u300D\u8F93\u5165\u6846\u8F93\u5165 \u8FD9\u662F\u4E00\u6761\u6D4B\u8BD5\u516C\u544A","value":"\u8FD9\u662F\u4E00\u6761\u6D4B\u8BD5\u516C\u544A"},
  {"kind":"action","action":"click","instruction":"\u70B9\u51FB\u300C\u53D1\u5E03\u300D\u6309\u94AE"},
  {"kind":"assert","instruction":"\u65AD\u8A00\u516C\u544A\u5217\u8868\u51FA\u73B0\u6807\u9898\u4EE5 \u516C\u544A_ \u5F00\u5934\u7684\u65B0\u6761\u76EE","assertion":{"type":"text","expected":"\u516C\u544A_"}},
  {"kind":"assert","instruction":"\u65AD\u8A00\u516C\u544A\u5217\u8868\u63A5\u53E3\u8FD4\u56DE\u7684\u6700\u65B0\u6807\u9898\u5305\u542B\u65B0\u6807\u9898\u524D\u7F00","assertion":{"type":"response_json","urlMatch":"/api/announcements","expected":"\u516C\u544A_","jsonPath":"data[0].title"}}
]}`;
var CONFIG_PATH = process.env.CONFIG_PATH ?? path3.resolve(".local-config.json");
function readConfigFile() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("[config] \u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6\u5931\u8D25:", e);
  }
  return {};
}
function getConfig() {
  const file = readConfigFile();
  return {
    openaiApiKey: file.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    openaiBaseUrl: file.openaiBaseUrl ?? process.env.OPENAI_BASE_URL ?? "",
    openaiModel: file.openaiModel ?? process.env.OPENAI_MODEL ?? "deepseek-v4-flash-vision-exp",
    openaiModelVision: typeof file.openaiModelVision === "boolean" ? file.openaiModelVision : false,
    maxSteps: typeof file.maxSteps === "number" ? file.maxSteps : 200,
    browserPath: file.browserPath ?? "",
    // 旧版拆步提示词（无「必须带 action 字段」特征）已不适用预拆分流程，检出即退回新默认
    splitSystemPrompt: (() => {
      const saved = typeof file.splitSystemPrompt === "string" && file.splitSystemPrompt.trim() ? file.splitSystemPrompt : "";
      return saved && saved.includes('\u5FC5\u987B\u5E26 "action" \u5B57\u6BB5') ? saved : DEFAULT_SPLIT_SYSTEM_PROMPT;
    })(),
    reasoningEffort: REASONING_EFFORTS.includes(file.reasoningEffort) ? file.reasoningEffort : "",
    // 默认保留 5 天；显式存 0 也视作「永久」（避免用户手动设 0 时被误清）
    generationLogRetentionDays: typeof file.generationLogRetentionDays === "number" && file.generationLogRetentionDays > 0 ? file.generationLogRetentionDays : file.generationLogRetentionDays === null ? null : 5
  };
}
function isConfigured() {
  const c = getConfig();
  return Boolean(c.openaiApiKey && c.openaiBaseUrl);
}
function saveConfig(partial) {
  const next = { ...getConfig(), ...partial };
  fs.mkdirSync(path3.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
function getScreenshotDir() {
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  const dbPath = dbUrl.replace(/^file:/, "");
  const dir = path3.dirname(path3.resolve(dbPath));
  const screenshotDir = path3.join(dir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  return screenshotDir;
}

// src/browser.ts
import fs2 from "fs";
import { chromium } from "playwright";
var DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
var MAC_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
];
var WIN_CANDIDATES = [
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
  String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
];
function detectSystemChrome() {
  const candidates = process.platform === "darwin" ? MAC_CANDIDATES : process.platform === "win32" ? WIN_CANDIDATES : [];
  return candidates.find((p) => fs2.existsSync(p));
}
function isSystemBrowserMode() {
  return process.env.BROWSER_MODE === "system";
}
function browserLaunchOptions(extra = {}) {
  const cfg = getConfig();
  const vp = readViewport(extra.viewport) ?? DEFAULT_VIEWPORT;
  const { viewport: _viewportOpt, ...rest } = extra;
  const opts = { ...rest, args: [...rest.args ?? [], `--window-size=${vp.width},${vp.height}`] };
  if (cfg.browserPath) {
    return { executablePath: cfg.browserPath, ...opts };
  }
  if (isSystemBrowserMode()) {
    const detected = detectSystemChrome();
    if (detected) return { executablePath: detected, ...opts };
    return { channel: "chrome", ...opts };
  }
  let bundled;
  try {
    bundled = chromium.executablePath();
  } catch {
    bundled = void 0;
  }
  return bundled ? { executablePath: bundled, ...opts } : { ...opts };
}
function codegenBrowserArgs() {
  if (isSystemBrowserMode()) return ["--channel=chrome"];
  return [];
}

// src/services/tokenUsage.ts
var EMPTY = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 };
var store = /* @__PURE__ */ new Map();
function initUsage(jobId) {
  store.set(jobId, { ...EMPTY });
}
function ensureUsage(jobId) {
  if (!store.has(jobId)) store.set(jobId, { ...EMPTY });
}
function addUsage(jobId, u) {
  const cur = store.get(jobId);
  if (!cur) return;
  cur.inputTokens += u.inputTokens ?? 0;
  cur.outputTokens += u.outputTokens ?? 0;
  cur.totalTokens += u.totalTokens ?? 0;
  cur.cachedTokens += u.cachedTokens ?? 0;
}
function getUsage(jobId) {
  return store.get(jobId) ?? { ...EMPTY };
}
function clearUsage(jobId) {
  store.delete(jobId);
}

// src/services/stagehandManager.ts
var sessions = /* @__PURE__ */ new Map();
function onSessionBrowserClosed(jobId, handler) {
  const s = sessions.get(jobId);
  if (!s) return () => {
  };
  s.onClosed = handler;
  void ensureCloseMonitor(jobId);
  return () => {
    if (sessions.get(jobId) === s) s.onClosed = void 0;
  };
}
async function ensureCloseMonitor(jobId) {
  const s = sessions.get(jobId);
  if (!s || !s.cdpPort || s.monitor || s.monitorClosed) return;
  try {
    const monitor = await chromium2.connectOverCDP(`http://127.0.0.1:${s.cdpPort}`);
    s.monitor = monitor;
    monitor.on("disconnected", () => {
      s.monitorClosed = true;
      s.onClosed?.();
    });
  } catch {
  }
}
function wrapOpenAIWithUsage(client, jobId) {
  const origCreate = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = (...args) => {
    const ret = origCreate(...args);
    if (ret && typeof ret.then === "function") {
      return ret.then((res) => {
        const u = res?.usage;
        if (u) {
          addUsage(jobId, {
            inputTokens: u.prompt_tokens ?? 0,
            outputTokens: u.completion_tokens ?? 0,
            totalTokens: u.total_tokens ?? 0,
            cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0
          });
          if (process.env.TT_USAGE_DEBUG) {
            console.log(`[usage] +${u.total_tokens}\uFF08\u7F13\u5B58 ${u.prompt_tokens_details?.cached_tokens ?? 0}\uFF09job=${jobId} \u7D2F\u8BA1=${getUsage(jobId).totalTokens}`);
          }
        }
        return res;
      });
    }
    return ret;
  };
  return client;
}
function createGatewayClient(usageKey) {
  const c = getConfig();
  return wrapOpenAIWithUsage(new OpenAI({ apiKey: c.openaiApiKey, baseURL: c.openaiBaseUrl }), usageKey);
}
function contentBlocks(content) {
  if (Array.isArray(content)) return content;
  return content ? [content] : [];
}
function buildOpenAIMessages(req, systemPrompt) {
  const out = [];
  for (const m of req.messages ?? []) {
    const blocks = contentBlocks(m.content);
    if (m.role === "assistant") {
      const textParts = blocks.filter((b) => b.type === "text").map((b) => ({ type: "text", text: String(b.text) }));
      const toolUses = blocks.filter((b) => b.type === "tool_use");
      const assistantMsg = { role: "assistant", content: textParts.length ? textParts : null };
      if (toolUses.length) {
        assistantMsg.tool_calls = toolUses.map((b) => ({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {})
          }
        }));
      }
      out.push(assistantMsg);
    } else {
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      const others = blocks.filter((b) => b.type !== "tool_result");
      if (others.length) {
        out.push({
          role: "user",
          content: others.map(
            (b) => b.type === "image" ? { type: "image_url", image_url: { url: `data:${b.mimeType};base64,${b.data}` } } : { type: "text", text: String(b.text) }
          )
        });
      }
      for (const tr of toolResults) {
        const text = contentBlocks(tr.content).map((c) => c.type === "text" ? String(c.text) : "[\u56FE\u7247]").join("\n");
        out.push({ role: "tool", tool_call_id: tr.toolUseId, content: text });
      }
    }
  }
  if (systemPrompt) out.unshift({ role: "system", content: String(systemPrompt) });
  return out;
}
function buildOpenAITools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? { type: "object", properties: {} }
    }
  }));
}
function mapStopReason(finishReason) {
  switch (finishReason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "content_filter";
    default:
      return finishReason || "stop";
  }
}
function normalizeElementId(v) {
  if (typeof v !== "string") return v;
  const s = v.trim().replace(/^\[|\]$/g, "");
  if (/^\d+-\d+$/.test(s)) return s;
  const m = s.match(/(\d+)-(\d+)/);
  if (m) return `${m[1]}-${m[2]}`;
  if (/^\d+$/.test(s)) return `0-${s}`;
  return v;
}
function normalizeStructuredOutput(node) {
  if (Array.isArray(node)) return node.map(normalizeStructuredOutput);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === "elementId" ? normalizeElementId(v) : normalizeStructuredOutput(v);
    }
    return out;
  }
  return node;
}
function createClientLLM(usageKey) {
  const client = createGatewayClient(usageKey);
  return {
    generate: async (req) => {
      const cfg = getConfig();
      const structured = req.responseFormat?.type === "json_schema";
      const schema = structured ? req.responseFormat?.schema : void 0;
      let systemPrompt = req.systemPrompt;
      if (structured && schema && typeof schema === "object") {
        systemPrompt = `${systemPrompt ? systemPrompt + "\n\n" : ""}\u8F93\u51FA\u5FC5\u987B\u662F\u4E00\u4E2A JSON \u5BF9\u8C61\u4E14\u4E25\u683C\u7B26\u5408\u4E0B\u9762\u7684 JSON Schema\uFF08\u9876\u5C42\u82E5\u662F object \u5C31\u8F93\u51FA\u5BF9\u8C61\uFF0C\u4E0D\u8981\u8F93\u51FA\u88F8\u6570\u7EC4\uFF09\uFF1A
${JSON.stringify(schema).slice(0, 4e3)}

\u7279\u522B\u6CE8\u610F\uFF1A\u6240\u6709 "elementId" \u5B57\u6BB5\u5FC5\u987B\u662F\u300C\u5E27\u5E8F\u53F7-\u8282\u70B9ID\u300D\u683C\u5F0F\uFF08\u5982 "0-18372"\uFF09\uFF0C\u53EA\u80FD\u5305\u542B\u6570\u5B57\u548C\u4E2D\u95F4\u7684\u8FDE\u5B57\u7B26\uFF0C\u4E0D\u8981\u5E26\u65B9\u62EC\u53F7\uFF0C\u4E0D\u8981\u53EA\u5199\u8282\u70B9 ID\uFF08\u5982 "18372"\uFF09\u3002`;
      }
      const body = {
        model: cfg.openaiModel,
        messages: buildOpenAIMessages(req, systemPrompt)
      };
      const tools = req.tools?.length ? buildOpenAITools(req.tools) : void 0;
      if (tools) {
        body.tools = tools;
        if (req.toolChoice?.mode) body.tool_choice = req.toolChoice.mode;
      }
      if (structured) body.response_format = { type: "json_object" };
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.stopSequences?.length) body.stop = req.stopSequences;
      if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
      else {
        body.thinking = { type: "disabled" };
        if (body.temperature == null) body.temperature = 0;
      }
      const completion = await client.chat.completions.create(body);
      const choice = completion.choices?.[0];
      const msg = choice?.message ?? {};
      const usage = completion.usage;
      const u = usage ? {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
      } : void 0;
      const contentText = typeof msg.content === "string" ? msg.content : "";
      const content = contentText ? [{ type: "text", text: contentText }] : [];
      for (const tc of msg.tool_calls ?? []) {
        let input = {};
        try {
          input = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          input = {};
        }
        content.push({ type: "tool_use", id: tc.id, name: tc.function?.name ?? "", input });
      }
      const base = { role: "assistant", content, stopReason: mapStopReason(choice?.finish_reason), usage: u };
      if (structured) {
        let parsed = {};
        try {
          const cleaned = contentText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = {};
        }
        if (Array.isArray(parsed) && schema?.type === "object" && schema.properties) {
          const arrKey = Object.keys(schema.properties).find((k) => schema.properties[k]?.type === "array");
          if (arrKey) parsed = { [arrKey]: parsed };
        }
        parsed = normalizeStructuredOutput(parsed);
        return { ...base, outputFormat: "json_schema", structuredContent: parsed };
      }
      return { ...base, outputFormat: "text" };
    }
  };
}
function makeUserDataDir() {
  const raw3 = mkdtempSync(join3(tmpdir(), "testtool-chrome-"));
  try {
    return realpathSync(raw3);
  } catch {
    return raw3;
  }
}
function launchOptions(headless = false, viewport) {
  const base = browserLaunchOptions();
  const userDataDir = makeUserDataDir();
  const opts = {
    headless,
    userDataDir,
    // localBrowser 按 viewport 生成 --window-size=W,H（有头=窗口大小，无头=视口大小）；未配置时回落全局默认
    viewport: viewport ?? DEFAULT_VIEWPORT,
    // 只去掉 --password-store=basic：它会强制在临时 profile 里开 SQLite 密码库失败，触发「打开个人资料出问题」；
    // 保留 --use-mock-keychain：让 Chrome 用模拟钥匙串，避免弹真实 macOS 钥匙串的「Chromium Safe Storage」授权框。
    ignoreDefaultArgs: ["--password-store=basic"]
  };
  if (base.executablePath) opts.executablePath = base.executablePath;
  else if (base.channel) {
    const detected = detectSystemChrome();
    if (detected) opts.executablePath = detected;
  }
  return { opts, userDataDir };
}
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port2 = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port2));
    });
  });
}
function isPortListening(port2) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(true));
    srv.once("listening", () => srv.close(() => resolve(false)));
    srv.listen(port2, "127.0.0.1");
  });
}
async function getFreeCdpPort() {
  for (let i = 0; i < 10; i++) {
    const port2 = await getFreePort();
    if (!await isPortListening(port2)) return port2;
  }
  return getFreePort();
}
async function launchFreshBrowser(lo, cdpPort) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const port2 = attempt === 0 ? cdpPort : await getFreeCdpPort();
    if (await isPortListening(port2)) continue;
    return await localBrowser.launch({ ...lo, port: port2 });
  }
  return await localBrowser.launch({ ...lo, port: cdpPort });
}
function friendlyBrowserLaunchError(e) {
  const raw3 = String(e);
  if (/method\s*not\s*available|method\s*not\s*found|-32601|Extensions\.loadUnpacked/i.test(raw3)) {
    return `${raw3}\u3002\u8FD9\u901A\u5E38\u662F\u6D4F\u89C8\u5668\u5B9E\u4F8B\u51B2\u7A81\uFF08\u6B8B\u7559\u7684 Chrome \u8FDB\u7A0B\u88AB\u590D\u7528\uFF09\u5BFC\u81F4\uFF0C\u8BF7\u5173\u95ED\u6240\u6709 Chrome \u7A97\u53E3\u4E0E\u540E\u53F0\u8FDB\u7A0B\u540E\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u91CD\u542F\u7535\u8111\u540E\u518D\u8BD5\u3002`;
  }
  if (/profile|个人资料|打开个人资料|user[- ]data[- ]dir/i.test(raw3)) {
    return `${raw3}\u3002\u8FD9\u901A\u5E38\u662F\u6D4F\u89C8\u5668\u4E34\u65F6\u914D\u7F6E\u76EE\u5F55\u51B2\u7A81\u5BFC\u81F4\uFF0C\u8BF7\u5173\u95ED\u6240\u6709 Chrome \u7A97\u53E3\u4E0E\u540E\u53F0\u8FDB\u7A0B\u540E\u91CD\u8BD5\u3002`;
  }
  return raw3;
}
async function createSession(jobId, opts = {}) {
  const usageKey = opts.usageKey ?? jobId;
  const cdpPort = await getFreeCdpPort();
  const { opts: lo, userDataDir } = launchOptions(false, opts.viewport);
  const browser = await launchFreshBrowser(lo, cdpPort);
  const stagehand = await Stagehand.create({
    browser,
    model: { generate: createClientLLM(usageKey).generate },
    logging: { level: "warn" }
  });
  sessions.set(jobId, { stagehand, browser, userDataDir, cdpPort });
  return stagehand;
}
async function createRunBrowser(jobId, opts = {}) {
  const usageKey = opts.usageKey ?? jobId;
  const cdpPort = await getFreeCdpPort();
  const { opts: lo, userDataDir } = launchOptions(opts.headless === true, opts.viewport);
  const browser = await launchFreshBrowser(lo, cdpPort);
  const stagehand = await Stagehand.create({
    browser,
    model: { generate: createClientLLM(usageKey).generate },
    logging: { level: "warn" }
  });
  sessions.set(jobId, { stagehand, browser, userDataDir, cdpPort });
  return { stagehand, cdpPort };
}
async function createSessionWithStorageState(jobId, storageState, viewport) {
  const stagehand = await createSession(jobId, { viewport });
  const ss = storageState;
  try {
    const ctx = stagehand.browser.context;
    if (ss?.cookies?.length) await ctx.addCookies(ss.cookies);
    const origins = (ss?.origins ?? []).filter(
      (o) => Boolean(o?.origin && Array.isArray(o?.localStorage) && o.localStorage.length)
    );
    if (origins.length) {
      await ctx.addInitScript(
        (data) => {
          const origin = (data ?? []).find((o) => globalThis.location.origin === o.origin);
          if (origin?.localStorage) {
            for (const { name, value } of origin.localStorage) localStorage.setItem(name, String(value));
          }
        },
        origins
      );
    }
    return stagehand;
  } catch (e) {
    await closeSession(jobId);
    throw e;
  }
}
function getSession(jobId) {
  return sessions.get(jobId)?.stagehand;
}
function getCdpPort(jobId) {
  return sessions.get(jobId)?.cdpPort;
}
async function closeSession(jobId) {
  const s = sessions.get(jobId);
  if (s) {
    s.onClosed = void 0;
    if (s.monitor) {
      try {
        await s.monitor.close();
      } catch {
      }
      s.monitor = void 0;
    }
    try {
      await s.stagehand.close();
    } catch {
    }
    if (s.browser) {
      try {
        await s.browser.close();
      } catch {
      }
    }
    if (s.userDataDir) {
      try {
        rmSync(s.userDataDir, { recursive: true, force: true });
      } catch {
      }
    }
    sessions.delete(jobId);
  }
}
async function sessionPage(stagehand) {
  try {
    const ctx = stagehand.browser.context;
    const active = await ctx.activePage();
    if (active) return active;
    const pages = await ctx.pages();
    return pages[0];
  } catch {
    return void 0;
  }
}

// src/services/connectivityProbe.ts
var PROBE_TIMEOUT_MS = 1e4;
function resolveProbeTarget(steps) {
  return steps.find((s) => s.action === "goto" && s.url)?.url;
}
function probeable(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.includes("{{") || url.includes("${")) return false;
  try {
    new URL(url);
  } catch {
    return false;
  }
  return true;
}
function classifyProbeError(e) {
  const cause = e?.cause ?? e;
  const code = cause?.code ?? e?.code ?? "";
  const name = [e?.name, cause?.name].find((n) => n && n !== "Error") ?? "";
  if (name === "TimeoutError" || name === "AbortError" || code === "ABORT_ERR" || /timeout|timed?\s*out/i.test(String(cause?.message ?? ""))) {
    return `\u8FDE\u63A5\u8D85\u65F6\uFF08${PROBE_TIMEOUT_MS / 1e3} \u79D2\u65E0\u54CD\u5E94\uFF09`;
  }
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "\u57DF\u540D\u89E3\u6790\u5931\u8D25\uFF08\u8BF7\u68C0\u67E5\u57DF\u540D\u62FC\u5199\u6216 DNS \u914D\u7F6E\uFF09";
    case "ECONNREFUSED":
      return "\u8FDE\u63A5\u88AB\u62D2\u7EDD\uFF08\u76EE\u6807\u670D\u52A1\u53EF\u80FD\u672A\u542F\u52A8\uFF09";
    case "ECONNRESET":
      return "\u8FDE\u63A5\u88AB\u91CD\u7F6E";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "\u7F51\u7EDC\u4E0D\u53EF\u8FBE\uFF08\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u4EE3\u7406\u914D\u7F6E\uFF09";
    default:
      if (/CERT|SSL|TLS/i.test(code)) return `\u8BC1\u4E66\u6821\u9A8C\u5931\u8D25\uFF08${code}\uFF09`;
      return String(cause?.message || code || e);
  }
}
async function probeConnectivity(url) {
  if (!probeable(url)) return void 0;
  let res;
  try {
    res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`\u8FDE\u901A\u6027\u63A2\u6D4B\u5931\u8D25\uFF1A\u65E0\u6CD5\u8BBF\u95EE ${url}\uFF08${classifyProbeError(e)}\uFF09`);
  }
  try {
    await res.body?.cancel();
  } catch {
  }
  return res.status;
}

// src/services/pluginRuntime.ts
var PLUGIN_RUNTIME_SCRIPT = String.raw`(() => {
  if (window.__ttPluginRuntimeInstalled__) return;
  window.__ttPluginRuntimeInstalled__ = true;
  // 插件通用轮询辅助：每 interval 调 fn()，返回真值即 resolve；超时 reject（动作内等弹层/DOM 刷新用）
  window.__ttPickWait = function (fn, timeout, interval) {
    return new Promise(function (resolve, reject) {
      const started = Date.now();
      const step = parseInt(interval, 10) > 0 ? parseInt(interval, 10) : 100;
      const t = setInterval(function () {
        let v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) { clearInterval(t); resolve(v); return; }
        if (Date.now() - started > (parseInt(timeout, 10) || 5000)) {
          clearInterval(t);
          reject(new Error('等待超时（' + (parseInt(timeout, 10) || 5000) + 'ms）'));
        }
      }, step);
    });
  };
  const plugins = [];
  const byId = new Map();
  const registry = {
    register(def) {
      try {
        if (!def || typeof def !== 'object' || !def.id) return;
        if (byId.has(def.id)) return;
        const p = {
          id: String(def.id),
          detect: typeof def.detect === 'function' ? def.detect : null,
          candidates: typeof def.candidates === 'function' ? def.candidates : null,
          annotate: typeof def.annotate === 'function' ? def.annotate : null,
          actions: def.actions && typeof def.actions === 'object' ? def.actions : {},
        };
        plugins.push(p);
        byId.set(def.id, p);
      } catch (e) {
        console.warn('[tt-plugin] register failed:', def && def.id, e);
      }
    },
    /** 逐插件探测：返回命中列表 [{id, version?}]（detect 可返回布尔或 {matched, version}）。 */
    detectAll(el) {
      const hits = [];
      for (const p of plugins) {
        if (!p.detect) continue;
        try {
          const r = p.detect(el);
          if (r) hits.push({ id: p.id, version: r && typeof r === 'object' ? r.version : undefined });
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return hits;
    },
    /** 收集各插件的候选增强，附 pluginId 标记（供平台 verifyCandidates 管线验证）。 */
    candidatesFor(el) {
      const out = [];
      for (const p of plugins) {
        if (!p.candidates) continue;
        try {
          const cs = p.candidates(el);
          if (Array.isArray(cs)) {
            for (const c of cs) {
              if (c && c.strategy && typeof c.value === 'string') out.push(Object.assign({}, c, { pluginId: p.id }));
            }
          }
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return out;
    },
    /** 各插件的语义标注文本拼接（snapshot 增注用）。 */
    annotateFor(el) {
      const parts = [];
      for (const p of plugins) {
        if (!p.annotate) continue;
        try {
          const t = p.annotate(el);
          if (t) parts.push('[' + p.id + '] ' + t);
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return parts.join(' ');
    },
    /** 匹配链解析：detect(el) 命中且 actions 含该动作（fn 可调用）的插件，按注册顺序（= preset 注入优先级）返回。 */
    resolveChain(el, action) {
      const out = [];
      if (!action || typeof action !== 'string') return out;
      for (const p of plugins) {
        if (!p.detect) continue;
        const def = p.actions ? p.actions[action] : null;
        const hasFn = typeof def === 'function' || (def && typeof def.fn === 'function');
        if (!hasFn) continue;
        try {
          const r = p.detect(el);
          const matched = r === true || !!(r && typeof r === 'object' && r.matched);
          if (matched) out.push({ id: p.id, variant: r && typeof r === 'object' ? r.variant : undefined });
        } catch (e) {
          /* 插件异常隔离 */
        }
      }
      return out;
    },
    /** 动作转发入口：平台外壳（生成期分发器 / 回放期重放）统一调用，结果归一化为三态协议（不抛错）：
     *  string 返回→success（向后兼容）、throw→failed、{status,message}→显式三态；
     *  成功后执行动作可选 verify 页内后验（不过视同 failed 交链上下一插件，后验自身异常视同 uncertain）。 */
    async invokeAction(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return { status: 'failed', message: '插件未注入：' + pluginId };
      const def = p.actions ? p.actions[action] : null;
      // 允许 actions[name] 为函数或 {fn, doc, preferFill, verify} 对象两种形态
      const impl = typeof def === 'function' ? def : (def && typeof def.fn === 'function' ? def.fn : null);
      if (!impl) return { status: 'failed', message: '插件 ' + pluginId + ' 未注册动作：' + action };
      let out;
      try {
        const raw = await impl(el, args, window.__ttPw);
        if (raw && typeof raw === 'object' && typeof raw.status === 'string') {
          const st = raw.status === 'success' || raw.status === 'failed' ? raw.status : 'uncertain';
          out = { status: st, message: raw.message == null ? '' : String(raw.message) };
        } else {
          out = { status: 'success', message: raw == null ? '' : String(raw) };
        }
      } catch (e) {
        return { status: 'failed', message: String((e && e.message) || e) };
      }
      if (out.status === 'success' && def && typeof def === 'object' && typeof def.verify === 'function') {
        try {
          const ok = await def.verify(el, args, window.__ttPw);
          if (!ok) out = { status: 'failed', message: (out.message ? out.message + '；' : '') + '动作后验未通过（终态与预期不符）' };
        } catch (ve) {
          out = { status: 'uncertain', message: (out.message ? out.message + '；' : '') + '后验执行异常：' + String((ve && ve.message) || ve) };
        }
      }
      return out;
    },
    /** 仅执行动作声明的页内后验（fill 优先路径用：验证输入是否真实提交，不运行动作本体）。
     *  返回 true/false；null = 无 verify 声明或后验异常（调用方回退帧哈希口径，不能当成功）。 */
    async invokeVerify(pluginId, action, el, args) {
      const p = byId.get(pluginId);
      if (!p) return null;
      const def = p.actions ? p.actions[action] : null;
      if (!def || typeof def !== 'object' || typeof def.verify !== 'function') return null;
      try {
        return !!(await def.verify(el, args, window.__ttPw));
      } catch (e) {
        return null;
      }
    },
    /** 已注册插件与其动作元数据清单（试运行回写/管理页展示用）：对象形态声明携带 doc/label/preferFill。 */
    listActions() {
      const out = [];
      for (const p of plugins) {
        const names = p.actions ? Object.keys(p.actions) : [];
        if (!names.length) continue;
        const metas = names.map(function (name) {
          const def = p.actions ? p.actions[name] : null;
          if (!def || typeof def !== 'object') return { name: name };
          const meta = { name: name };
          if (typeof def.doc === 'string' && def.doc) meta.doc = def.doc;
          if (typeof def.label === 'string' && def.label) meta.label = def.label;
          if (def.preferFill) meta.preferFill = true;
          return meta;
        });
        out.push({ id: p.id, actions: metas });
      }
      return out;
    },
    count() {
      return plugins.length;
    },
  };
  window.__ttPluginRegistry__ = registry;
  // —— Playwright 桥（页内代理）：与 Node 侧 services/pluginPwBridge.ts 的绑定配对 ——
  // 每个远程节点是 thenable 的 Proxy（包住最近一次调用的结果 Promise）：
  // - await（then）→ 结果解包：{__ttHandle} 句柄包装为可续链新节点，原始值/纯对象原样返回；
  // - 属性访问 → 惰性路径节点，「调用」时才发一次 RPC（{p:路径, a:参数, b:句柄id}）；
  //   有中间调用时先 await 其句柄再续链——pw.page.locator('.x').click() 与
  //   pw(el).locator('.i').click() 两种链式写法均成立（与真实 Playwright 同构）。
  function __ttPwIsHandle(r) {
    return !!(r && typeof r === 'object' && typeof r.__ttHandle === 'number');
  }
  // 句柄的「就绪视图」：可继续链式调用；刻意不响应 then/catch/finally——Promise 适配
  // 以「结果是否 thenable」终止，若把节点本身作为 fulfillment 值会被再次适配，
  // 每次又产出新节点 → 微任务无限递归（页面假死）。await 视图得到视图自身。
  function __ttPwHandleView(r) {
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string' || prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        return __ttPwNode(Promise.resolve(r), [prop], Promise.resolve(r));
      },
    });
  }
  function __ttPwNode(wire, path, baseWire) {
    const fn = function (...args) {
      let exec;
      if (!path.length && args.length === 1 && args[0] instanceof Element) {
        // 根调用 pw(el)：给元素打临时标记 → Node 侧解析为作用域 Locator 并延时清理标记
        if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
        const token = 'ttpw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        try {
          args[0].setAttribute('data-__tt-pw', token);
        } catch (e) {
          throw new Error('pw(el) 元素注册失败：元素不支持打标（须为主 frame 内的 Element）');
        }
        exec = window.__ttPwRpc({ elToken: token });
      } else {
        exec = (async function () {
          let bid = null;
          if (baseWire) {
            const b = await baseWire;
            if (b !== undefined) {
              if (__ttPwIsHandle(b)) bid = b.__ttHandle;
              else throw new Error('pw 链式调用中断：前一步返回的是原始值/纯对象，其上无法继续链式调用方法');
            }
          }
          if (typeof window.__ttPwRpc !== 'function') throw new Error('Playwright 桥未注入（__ttPwRpc 缺失）：pw 仅在平台外壳（生成/回放/插件试运行/harness）内可用');
          return window.__ttPwRpc({ p: path, a: args, b: bid });
        })();
      }
      return __ttPwNode(exec, [], exec);
    };
    return new Proxy(fn, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') {
          return function (res, rej) {
            return Promise.resolve(wire).then(function (r) {
              return __ttPwIsHandle(r) ? __ttPwHandleView(r) : r;
            }).then(res, rej);
          };
        }
        if (prop === 'catch') return function (rej) { return Promise.resolve(wire).catch(rej); };
        if (prop === 'finally') return function (f) { return Promise.resolve(wire).finally(f); };
        if (prop === 'toJSON') return undefined;
        return __ttPwNode(wire, path.concat(prop), baseWire);
      },
    });
  }
  // 根节点：baseWire = undefined 哨兵（无基），属性链从根对象（page/context）起算
  window.__ttPw = __ttPwNode(Promise.resolve(undefined), [], Promise.resolve(undefined));
})();`;
function buildPluginInitScript(plugins) {
  return [
    PLUGIN_RUNTIME_SCRIPT,
    ...plugins.map((p) => {
      const idLiteral = JSON.stringify(p.id);
      return [
        `window.__ttPluginId__ = ${idLiteral};`,
        `window.__ttPluginRegistry__.register(Object.assign((
${p.code}
) || {}, { id: ${idLiteral} }));`
      ].join("\n");
    })
  ].join("\n;\n");
}

// src/services/locatorCandidateScript.ts
var CANDIDATE_SCRIPT = PLUGIN_RUNTIME_SCRIPT + String.raw`(() => {
  if (window.__ttCandidatesInstalled__) return;
  window.__ttCandidatesInstalled__ = true;

  const textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();

  // —— 可见文本：无障碍播报类隐藏节点不入文本值 ——
  // textContent 会把 aria-live/sr-only 播报文本一并计入（如 antd select 交互后插入的
  // <span aria-live="polite" style="width:0;height:0;position:absolute;overflow:hidden;opacity:0">，
  // 与可见选中项拼成「XX」翻倍），且播报节点随交互瞬态出现/消失，据此生成的 text 候选与
  // 快照 label 在回放（静态 DOM）必不命中。计数（analyzeCounts）仍用 textOf——与 Playwright
  // getByText 匹配隐藏文本的语义保持一致，被污染的候选会因 count>1 被自然拒绝。
  // styleCache：同一次批量调用（如 __ttCollectInteractive 遍历全量元素）内缓存隐藏判定，避免重复 getComputedStyle。
  const isHiddenEl = (el, styleCache) => {
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    let st = styleCache && styleCache.get(el);
    if (!st) {
      st = getComputedStyle(el);
      if (styleCache) styleCache.set(el, st);
    }
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return true;
    // sr-only 常规写法：零尺寸 + overflow 裁剪（antd 播报节点带 opacity:0，已在上行命中；此行兜底其余 sr-only 变体）
    return el.offsetWidth === 0 && el.offsetHeight === 0 && (st.overflow === 'hidden' || st.overflow === 'clip');
  };
  const visibleTextOf = (node, styleCache) => {
    const cache = styleCache || new WeakMap();
    const isHidden = (el) => isHiddenEl(el, cache);
    const parts = [];
    const walk = (n) => {
      const kids = n.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (c.nodeType === 3) parts.push(c.nodeValue || '');
        else if (c.nodeType === 1 && !isHidden(c)) walk(c);
      }
    };
    walk(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };
  const cssEsc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));

  // 瞬态状态类剔除：open（展开）/focused（聚焦）/active/expanded（展开）/checked（勾选）/
  // selected（选中）/loading（加载中）/status-*（表单校验态）/ element-plus 的 is-* 交互态
  // 均随交互实时变化，编入 CSS 会导致回放（页面初始态）必不命中或命中错误元素。
  // 与 Node 侧 locatorVerifier.ts 的 TRANSIENT_CLASS_RE 保持一致。
  const TRANSIENT_CLASS_RE = /(^|-)(focused|open|active|expanded|checked|selected|loading)$|(^|-)status-(success|error|warning|validating)$|^is-(focus|focused|active|open|expanded|checked|selected|error)/;
  const stableClasses = (el) => Array.prototype.slice.call(el.classList || []).filter((c) => !TRANSIENT_CLASS_RE.test(c));

  // Playwright getByRole 只接受标准 ARIA role，非标准 role 会直接抛 "Unknown role"（无法执行）。
  // 显式 role 属性不在集合内时不生成 role 候选，回落其他策略。
  const KNOWN_ROLES = new Set(['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','definition','dialog','directory','document','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','log','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','meter','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem']);

  function computeRole(el) {
    const explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) {
      const r = explicit.trim().toLowerCase();
      if (r === 'presentation' || r === 'none') return '';
      if (KNOWN_ROLES.has(r)) return r;
      return ''; // 非标准 role：Playwright getByRole 无法执行，不作为 role 候选
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'img') return 'img';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'aside') return 'complementary';
    if (tag === 'article') return 'article';
    if (tag === 'dialog') return 'dialog';
    if (tag === 'table') return 'table';
    if (tag === 'tr') return 'row';
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'listitem';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      return 'textbox';
    }
    return '';
  }

  /** 元素的可见标签：aria-label > aria-labelledby > 关联 label > 包裹 label。labelList 供批量分析时复用。 */
  function computeLabelText(el, labelList) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const id = el.getAttribute('id');
    if (id) {
      const labels = labelList || document.querySelectorAll('label');
      for (let k = 0; k < labels.length; k++) {
        if (labels[k].htmlFor === id) {
          const t = textOf(labels[k]);
          if (t) return t;
        }
      }
    }
    let p = el.parentElement;
    while (p) {
      if (p.tagName && p.tagName.toLowerCase() === 'label') {
        const t = textOf(p);
        if (t) return t;
      }
      p = p.parentElement;
    }
    return '';
  }

  /** 可访问名近似：label/aria 优先，表单控件回退 placeholder，内容型角色取文本，最后 title。 */
  function computeName(el, labelList, styleCache) {
    const label = computeLabelText(el, labelList);
    if (label) return label;
    const tag = el.tagName.toLowerCase();
    const isForm = tag === 'input' || tag === 'select' || tag === 'textarea' || el.isContentEditable;
    if (isForm) {
      const ph = el.getAttribute('placeholder');
      return ph && ph.trim() ? ph.trim() : '';
    }
    const role = computeRole(el);
    const contentRoles = ['button', 'link', 'heading', 'navigation', 'region', 'article', 'complementary', 'banner', 'contentinfo', 'main', 'dialog', 'tab', 'menuitem', 'option', 'listitem', 'form', 'search', 'alert', 'status', 'checkbox', 'radio', 'tabpanel', 'tooltip'];
    if (contentRoles.includes(role)) {
      // 可见文本：aria-live/sr-only 播报节点会使 textContent 瞬态翻倍（回放必不命中），同 text 候选策略
      const t = visibleTextOf(el, styleCache);
      if (t) return t;
    }
    const title = el.getAttribute('title');
    return title && title.trim() ? title.trim() : '';
  }

  /** 祖先特征：id > tag+全部class > tag（供 CSS 前缀拼接用）。class 剔除瞬态状态类。 */
  function ancestorFeature(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) return '#' + cssEsc(id);
    const classes = stableClasses(el);
    if (classes.length) return tag + classes.map((c) => '.' + cssEsc(c)).join('');
    return tag;
  }

  /**
   * 向上找模态框类容器（弹层内容经 portal 渲染到 body 下，定位锚定到容器内可避免顶层弹层序号漂移）。
   * 容器描述优先 role=dialog，其次容器自身唯一的 class css / #id；找不到唯一描述则不生成作用域。
   */
  function findModalScope(el) {
    if (!el.closest) return null;
    const container = el.closest('[role="dialog"], dialog, [aria-modal="true"], .ant-modal, .modal, .el-dialog');
    if (!container || container === el || container === document.body || container === document.documentElement) return null;
    const roleAttr = container.getAttribute('role');
    if (roleAttr === 'dialog' || container.tagName.toLowerCase() === 'dialog') {
      return { scope: { strategy: 'role', value: 'dialog', role: 'dialog' }, container: container };
    }
    const tag = container.tagName.toLowerCase();
    const classes = Array.prototype.slice.call(container.classList || []);
    if (classes.length) {
      const sel = tag + classes.map((c) => '.' + cssEsc(c)).join('');
      try {
        if (document.querySelectorAll(sel).length === 1) return { scope: { strategy: 'css', value: sel }, container: container };
      } catch { /* 忽略 */ }
    }
    if (container.id) {
      try {
        if (document.getElementById(container.id) === container) return { scope: { strategy: 'css', value: '#' + cssEsc(container.id) }, container: container };
      } catch { /* 忽略 */ }
    }
    return null;
  }

  /**
   * 生成 CSS 定位器：自身特征（#id、tag.allClasses、tag.firstClass、tag）首个唯一的直接返回；
   * 仍重复时沿祖先链由近到远收集 id/class 特征逐级加前缀；结构性完全相同的兜底才用 nth-of-type 路径。
   * anchor：作用域容器 -- 唯一性按容器内判定、路径相对容器生成。
   */
  function computeCss(el, anchor) {
    const scopeRoot = anchor || document;
    const unique = (sel) => {
      try {
        return scopeRoot.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    };
    const stopAt = anchor || document.body;
    const tag = el.tagName.toLowerCase();
    const classes = stableClasses(el);
    const id = el.getAttribute('id');
    if (id) {
      try {
        if (document.getElementById(id) === el && document.querySelectorAll('#' + cssEsc(id)).length === 1) return '#' + cssEsc(id);
      } catch { /* 忽略 */ }
    }
    const own = [];
    if (classes.length) {
      own.push(tag + classes.map((c) => '.' + cssEsc(c)).join(''));
      own.push(tag + '.' + cssEsc(classes[0]));
    }
    own.push(tag);
    for (const s of own) if (unique(s)) return s;

    const base = own[0] || tag;
    const chain = [];
    let cur = el.parentElement;
    while (cur && cur.nodeType === 1 && cur !== stopAt && cur !== document.body && cur !== document.documentElement) {
      chain.unshift(ancestorFeature(cur));
      const outer = chain[0] + ' ' + base;
      if (unique(outer)) return outer;
      const full = chain.join(' ') + ' ' + base;
      if (unique(full)) return full;
      cur = cur.parentElement;
    }

    const parts = [];
    let c2 = el;
    while (c2 && c2.nodeType === 1) {
      if (anchor && c2 === anchor) break;
      const pTag = c2.tagName.toLowerCase();
      let nth = 1;
      let sameTag = 0;
      let sib = c2.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === pTag) {
          nth++;
          sameTag++;
        }
        sib = sib.previousElementSibling;
      }
      let nxt = c2.nextElementSibling;
      while (nxt) {
        if (nxt.tagName.toLowerCase() === pTag) sameTag++;
        nxt = nxt.nextElementSibling;
      }
      parts.unshift(sameTag > 0 ? pTag + ':nth-of-type(' + nth + ')' : pTag);
      if (!anchor && (c2 === document.body || c2 === document.documentElement)) break;
      c2 = c2.parentElement;
    }
    return parts.join(' > ');
  }

  function computeXPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const tag = cur.tagName.toLowerCase();
      let idx = 1;
      let sameTag = 0;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) {
          idx++;
          sameTag++;
        }
        sib = sib.previousElementSibling;
      }
      let nxt = cur.nextElementSibling;
      while (nxt) {
        if (nxt.tagName.toLowerCase() === tag) sameTag++;
        nxt = nxt.nextElementSibling;
      }
      parts.unshift(sameTag > 0 ? tag + '[' + idx + ']' : tag);
      if (cur === document.documentElement) break;
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  /**
   * 按定位器优先级生成候选：testid > role > label > placeholder > text > alt > title > css > xpath。
   * 元素在弹层容器内时，所有候选附 scope，css 相对容器生成，且不再生成绝对 xpath。
   * 返回 { candidates, container }：container 为弹层容器元素（analyzeCounts 用作统计根），无弹层时为 null。
   */
  function computeCandidates(el) {
    const out = [];
    // 插件候选增强：各成员插件经运行时框架贡献的候选（已带 pluginId），插在通用候选之前——
    // 组件感知候选通常质量更高；全部候选仍统一走 verifyCandidates（count===1+同节点）验证。
    try {
      const reg = window.__ttPluginRegistry__;
      if (reg) {
        const pcs = reg.candidatesFor(el);
        for (const c of pcs) out.push(c);
      }
    } catch (e) {
      /* 插件候选异常不影响通用候选生成 */
    }
    const inMainDoc = el.getRootNode && el.getRootNode() === document;
    const ms = inMainDoc ? findModalScope(el) : null;
    const scope = ms ? ms.scope : null;
    const container = ms ? ms.container : null;
    const testid = el.getAttribute('data-testid');
    if (testid) out.push({ strategy: 'testid', value: testid, scope: scope });
    const role = computeRole(el);
    const name = computeName(el);
    if (role && name) out.push({ strategy: 'role', value: role, role: role, name: name, scope: scope });
    // label 包裹的可勾选控件（antd/element-plus 的 checkbox/radio wrapper）：可点击命中面是包裹层
    // 本身（computeRole 对 label 无映射），role 候选缺失会落到 css 并把动作后状态类编入定位器
    // （实测「选择«智能体平台»」步自愈即此因）。从内层唯一 input 取 role + 可访问名补一个
    // role 候选——与回放自愈实际采用的定位一致；无文本的图标式勾选框不生成（iname 为空）。
    if (!(role && name)) {
      const tagName = (el.tagName || '').toLowerCase();
      const lbl = tagName === 'label' ? el : (el.closest ? el.closest('label') : null);
      const inputs = lbl && lbl.querySelectorAll ? lbl.querySelectorAll('input[type="checkbox"],input[type="radio"]') : [];
      if (inputs.length === 1) {
        const innerRole = inputs[0].getAttribute('type') === 'radio' ? 'radio' : 'checkbox';
        const innerName = computeName(inputs[0]);
        if (innerName) out.push({ strategy: 'role', value: innerRole, role: innerRole, name: innerName, scope: scope });
      }
    }
    const label = computeLabelText(el);
    if (label) out.push({ strategy: 'label', value: label, scope: scope });
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) out.push({ strategy: 'placeholder', value: ph.trim(), scope: scope });
    const t = visibleTextOf(el); // 可见文本：aria-live 播报节点会使 textContent 瞬态翻倍（如「XX」），回放必不命中
    if (t && t.length <= 80) out.push({ strategy: 'text', value: t, scope: scope });
    const alt = el.getAttribute('alt');
    if (alt) out.push({ strategy: 'alt', value: alt, scope: scope });
    const title = el.getAttribute('title');
    if (title && title.trim()) out.push({ strategy: 'title', value: title.trim(), scope: scope });
    if (inMainDoc) {
      if (ms) {
        const css = computeCss(el, ms.container);
        if (css) out.push({ strategy: 'css', value: css, scope: scope });
      } else {
        const css = computeCss(el);
        if (css) out.push({ strategy: 'css', value: css });
        out.push({ strategy: 'xpath', value: computeXPath(el) });
      }
    }
    return { candidates: out, container: container };
  }

  function candidateLabel(c) {
    if (!c) return '（无可用定位器）';
    return c.strategy === 'role'
      ? c.strategy + '=' + (c.role || '') + ' name=' + (c.name || '')
      : c.strategy + '=' + c.value;
  }

  /** 页内重复检测：估算每个候选的匹配数量（1=唯一，>1=有重复，0/-1=无法判定）。scopeRoot 为弹层容器时在容器内统计。 */
  function attrVal(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function analyzeCounts(cands, scopeRoot) {
    const counts = [];
    const needRole = [];
    const needLabel = [];
    const needText = [];
    const root = scopeRoot || document;
    const qsa = (sel) => root.querySelectorAll(sel).length;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      try {
        switch (c.strategy) {
          case 'testid': counts[i] = qsa('[data-testid="' + attrVal(c.value) + '"]'); break;
          case 'placeholder': counts[i] = qsa('[placeholder="' + attrVal(c.value) + '"]'); break;
          case 'alt': counts[i] = qsa('[alt="' + attrVal(c.value) + '"]'); break;
          case 'title': counts[i] = qsa('[title="' + attrVal(c.value) + '"]'); break;
          case 'css': counts[i] = qsa(c.value); break;
          case 'xpath': {
            const r = document.evaluate(c.value, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            counts[i] = r.snapshotLength;
            break;
          }
          case 'role': needRole.push(i); break;
          case 'label': needLabel.push(i); break;
          case 'text': needText.push(i); break;
          default: counts[i] = -1;
        }
      } catch {
        counts[i] = -1;
      }
    }

    if (needRole.length || needLabel.length || needText.length) {
      const labelList = Array.prototype.slice.call(root.querySelectorAll('label'));
      // Playwright 的 getByRole/getByLabel/getByText 匹配均大小写不敏感、空白归一；
      // 计数也按小写比较，避免页内估算唯一而 Playwright 严格模式多匹配。
      const wantRole = {};
      const wantLabel = {};
      const wantText = {};
      for (const i of needRole) wantRole[((cands[i].role || '') + '|' + (cands[i].name || '')).toLowerCase()] = true;
      for (const i of needLabel) wantLabel[(cands[i].value || '').toLowerCase()] = true;
      for (const i of needText) wantText[(cands[i].value || '').toLowerCase()] = true;
      const roleCount = {};
      const labelCount = {};
      const textCount = {};
      const all = scopeRoot ? scopeRoot.querySelectorAll('*') : document.body ? document.querySelectorAll('body *') : [];
      const styleCache = new WeakMap(); // 本轮计数复用隐藏判定（computeName 的 visibleTextOf 逐元素 getComputedStyle 开销收拢）
      for (let k = 0; k < all.length; k++) {
        const el = all[k];
        if (needRole.length) {
          const r = computeRole(el);
          if (r) {
            const n = computeName(el, labelList, styleCache);
            if (n) {
              const key = (r + '|' + n).toLowerCase();
              if (wantRole[key]) roleCount[key] = (roleCount[key] || 0) + 1;
            }
          }
        }
        if (needLabel.length) {
          const l = computeLabelText(el, labelList);
          if (l) {
            const lk = l.toLowerCase();
            if (wantLabel[lk]) labelCount[lk] = (labelCount[lk] || 0) + 1;
          }
        }
        if (needText.length) {
          const t = textOf(el);
          if (t) {
            const tl = t.toLowerCase();
            for (const tv in wantText) {
              if (tl.indexOf(tv) >= 0) textCount[tv] = (textCount[tv] || 0) + 1;
            }
          }
        }
      }
      for (const i of needRole) {
        const key = ((cands[i].role || '') + '|' + (cands[i].name || '')).toLowerCase();
        counts[i] = roleCount[key] || 0;
      }
      for (const i of needLabel) counts[i] = labelCount[(cands[i].value || '').toLowerCase()] || 0;
      for (const i of needText) counts[i] = textCount[(cands[i].value || '').toLowerCase()] || 0;
    }
    return counts;
  }

  function findBestIndex(cands, counts) {
    for (let i = 0; i < cands.length; i++) if (counts[i] === 1) return i;
    return -1;
  }

  /** 预览/确认栏描述：优先展示唯一候选；顶部候选有重复时说明将改用哪个。 */
  function describeCandidates(cands, counts) {
    const best = findBestIndex(cands, counts);
    const first = counts[0];
    const dupNote = typeof first === 'number' && first > 1 ? candidateLabel(cands[0]) + '（匹配 ' + first + ' 处）' : null;
    if (best >= 0) {
      const bestLabel = candidateLabel(cands[best]) + '（唯一）';
      return dupNote && best !== 0 ? dupNote + ' -> 将用 ' + bestLabel : bestLabel;
    }
    return dupNote ? dupNote + ' -> 无唯一匹配，将回退 css/xpath' : '无唯一匹配，将回退 css/xpath';
  }

  /** 按原始选择器解析元素：/ 或 xpath= 前缀走 XPath，否则 CSS。 */
  window.__ttResolve = function (raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let sel = raw;
    let asXPath = sel.startsWith('/') || /^xpath=/i.test(sel);
    if (/^xpath=/i.test(sel)) sel = sel.replace(/^xpath=/i, '');
    if (asXPath) {
      try {
        return document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      } catch {
        return null;
      }
    }
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  };

  /** 一次调用内完成候选生成 + 页内计数（container 与 counts 天然一致；无弹层容器时为 null，按整页统计）。pluginNotes 为各插件语义标注拼接（snapshot 增注用）。 */
  window.__ttAnalyze = function (el) {
    if (!el || el.nodeType !== 1) return null;
    const { candidates, container } = computeCandidates(el);
    const counts = analyzeCounts(candidates, container);
    let pluginNotes = '';
    try {
      pluginNotes = window.__ttPluginRegistry__ ? window.__ttPluginRegistry__.annotateFor(el) : '';
    } catch (e) {
      pluginNotes = '';
    }
    return { candidates: candidates, counts: counts, bestIndex: findBestIndex(candidates, counts), pluginNotes: pluginNotes };
  };

  // —— 可交互元素编号与视觉标注（视觉双通道：截图标注序号与快照编号同源）——
  // 标注样式参数（3px 边框 + 白底蓝字序号块）按 384-token 固定计价的低分辨率重采样保守设定，
  // 待真网关 1080p 表格页读字基线实测后可调大（参数集中在此，便于调整）。
  // 组件库自定义复选框/单选（.el-checkbox 等）：真实 input 隐藏会被下方可见性过滤，不加则该控件永远没有编号，
  // 模型只能按相邻元素编号瞎猜（实测把编号 124 的所属部门下拉当成用户类型复选框点击）→ 编号落在可点击的包裹层上
  var INTERACTIVE_SEL = 'a[href],button,input,select,textarea,[role="button"],[role="combobox"],[role="checkbox"],[role="radio"],[role="tab"],[role="link"],[role="textbox"],[role="option"],[role="menuitem"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"]),.ant-select,.ant-picker,.el-select,.el-date-editor,.el-checkbox,.el-radio,.el-checkbox-button,.el-radio-button,.ant-checkbox-wrapper,.ant-radio-wrapper';
  window.__ttIndexedEls__ = { byIndex: {}, lastUrl: '' };

  /** 元素 → 页内唯一 css 路径（id 优先，其余 nth-of-type 链）。 */
  window.__ttCssPath = function (el) {
    if (el.id) return '#' + el.id;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let sel = node.tagName.toLowerCase();
      const p = node.parentNode;
      if (p) {
        const sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === node.tagName; });
        if (sibs.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(sibs, node) + 1) + ')';
      }
      parts.unshift(sel);
      node = p;
    }
    return 'body ' + parts.join(' > ');
  };

  /** 收集可交互元素并分配编号（同页复用索引；输出平铺编号行，供快照文本与截图标注共用）。 */
  window.__ttCollectInteractive = function () {
    const state = window.__ttIndexedEls__;
    const url = location.href.split('#')[0];
    if (state.lastUrl !== url) { state.byIndex = {}; state.lastUrl = url; }
    // 清理全页旧标：重渲染后新节点会重新分配编号，残留的 data-tt-idx 会造成属性重复（strict violation）
    for (const n of document.querySelectorAll('[data-tt-idx]')) n.removeAttribute('data-tt-idx');
    const lines = [];
    let next = 0;
    for (const k of Object.keys(state.byIndex)) next = Math.max(next, parseInt(k, 10));
    const els = document.body ? document.body.querySelectorAll(INTERACTIVE_SEL) : [];
    const styleCache = new WeakMap(); // 本轮收集内复用隐藏判定（visibleTextOf 逐元素 getComputedStyle 的开销收拢为每元素一次）
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      let idx = el.__ttIdx;
      const isNew = idx == null;
      if (idx == null) { idx = ++next; el.__ttIdx = idx; }
      // 打属性标记：编号定位走 [data-tt-idx]（绝对唯一），避免 nth-of-type 路径在动态渲染下偏移
      if (el.getAttribute('data-tt-idx') !== String(idx)) el.setAttribute('data-tt-idx', String(idx));
      state.byIndex[idx] = el;
      const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || visibleTextOf(el, styleCache)).replace(/\s+/g, ' ').slice(0, 48);
      const dis = el.disabled || el.getAttribute('aria-disabled') === 'true' ? ' [disabled]' : '';
      lines.push('[' + idx + ']' + (isNew ? '*' : '') + '<' + el.tagName.toLowerCase() + (label ? ' ' + label : '') + '>' + dis);
    }
    return lines;
  };

  /** 给编号元素绘制标注框（截图前调用；粗边框 + 白底蓝字序号块，适配低分辨率重采样）。 */
  window.__ttDrawOverlays = function () {
    window.__ttClearOverlays();
    const state = window.__ttIndexedEls__;
    for (const idx of Object.keys(state.byIndex)) {
      const el = state.byIndex[idx];
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > (window.innerHeight || 900)) continue;
      const box = document.createElement('div');
      box.setAttribute('data-tt-overlay', '1');
      box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #1677FF;background:rgba(22,119,255,0.10);left:' + (r.left - 1) + 'px;top:' + (r.top - 1) + 'px;width:' + (r.width + 2) + 'px;height:' + (r.height + 2) + 'px;';
      const tag = document.createElement('div');
      tag.setAttribute('data-tt-overlay', '1');
      tag.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#1677FF;color:#fff;font:bold 14px/1.1 monospace;padding:2px 5px;border:1px solid #fff;border-radius:2px;left:' + r.left + 'px;top:' + Math.max(0, r.top - 18) + 'px;';
      tag.textContent = String(idx);
      document.body.appendChild(box);
      document.body.appendChild(tag);
    }
  };

  /** 清除标注（截图后恢复原始画面）。 */
  window.__ttClearOverlays = function () {
    for (const n of document.querySelectorAll('[data-tt-overlay="1"]')) n.remove();
  };

  window.__ttDescribe = function (cands, counts) {
    return describeCandidates(cands || [], counts || []);
  };

  /** 格式化一个已验证的 Locator（后端回写）为人类可读描述，供预览栏展示。 */
  window.__ttLocDesc = function (loc) {
    if (!loc) return '（无可用定位器）';
    return loc.strategy === 'role'
      ? 'role=' + (loc.role || loc.value) + ' name=' + (loc.name || '')
      : loc.strategy + '=' + loc.value;
  };

  /** 供后端对「仍存活」的目标元素按当前页面状态实时重算 CSS 兜底。 */
  window.__ttPickCss = function (el) {
    const ms = el && el.closest ? findModalScope(el) : null;
    return {
      css: ms ? computeCss(el, ms.container) : computeCss(el),
      scope: ms ? ms.scope : null,
    };
  };
})();`;
async function injectCandidates(page) {
  try {
    await page.evaluate(CANDIDATE_SCRIPT);
  } catch {
  }
}
async function analyzeElement(page, raw3) {
  await injectCandidates(page);
  const res = await page.evaluate((sel) => {
    const win = globalThis;
    const el = win.__ttResolve?.(sel);
    return el && el.nodeType === 1 ? win.__ttAnalyze(el) ?? null : null;
  }, raw3).catch(() => null);
  return res ?? null;
}
function rawLocatorOf(selector) {
  return selector.startsWith("/") || /^xpath=/i.test(selector) ? { strategy: "xpath", value: selector.replace(/^xpath=/i, "") } : { strategy: "css", value: selector };
}

// src/services/genToolsPlugin.ts
function parseActionMeta(raw3) {
  if (!Array.isArray(raw3)) return [];
  const out = [];
  for (const it of raw3) {
    if (it && typeof it.name === "string") {
      out.push({
        name: it.name,
        doc: typeof it.doc === "string" ? it.doc : void 0,
        label: typeof it.label === "string" ? it.label : void 0,
        preferFill: Boolean(it.preferFill)
      });
    }
  }
  return out;
}
function matchBraceSkipLiterals(s, openIdx) {
  let depth = 0;
  let inStr = null;
  let i = openIdx;
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl + 1;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      i = end < 0 ? s.length : end + 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}
function scanTopLevelBracedKeys(body) {
  const out = [];
  let i = 0;
  let depth = 0;
  let inStr = null;
  let identStart = -1;
  while (i < body.length) {
    const c = body[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "/" && body[i + 1] === "/") {
      const nl = body.indexOf("\n", i);
      i = nl < 0 ? body.length : nl + 1;
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (c === "{") {
      depth++;
      identStart = -1;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      identStart = -1;
      i++;
      continue;
    }
    if (depth === 0) {
      if (identStart < 0 && /[A-Za-z_$]/.test(c)) {
        identStart = i;
        i++;
        continue;
      }
      if (identStart >= 0 && /[\w$]/.test(c)) {
        i++;
        continue;
      }
      if (identStart >= 0 && c === ":") {
        const name = body.slice(identStart, i).trim();
        let j = i + 1;
        while (j < body.length && /\s/.test(body[j])) j++;
        if (body[j] === "{") {
          const end = matchBraceSkipLiterals(body, j);
          if (end > 0) {
            out.push({ name, defBody: body.slice(j + 1, end) });
            i = end + 1;
            identStart = -1;
            continue;
          }
        }
      }
      if (!/[\w$]/.test(c)) identStart = -1;
    }
    i++;
  }
  return out;
}
function readStringLiteral(s, openIdx) {
  const q = s[openIdx];
  if (q !== "'" && q !== '"' && q !== "`") return void 0;
  let val = "";
  let i = openIdx + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      val += n === "n" ? "\n" : n === "t" ? "	" : n ?? "";
      i += 2;
      continue;
    }
    if (c === q) return val.trim() || void 0;
    val += c;
    i++;
  }
  return void 0;
}
function topLevelStringValue(body, key) {
  let i = 0;
  let depth = 0;
  let inStr = null;
  let identStart = -1;
  while (i < body.length) {
    const c = body[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "/" && body[i + 1] === "/") {
      const nl = body.indexOf("\n", i);
      i = nl < 0 ? body.length : nl + 1;
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (c === "{") {
      depth++;
      identStart = -1;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      identStart = -1;
      i++;
      continue;
    }
    if (depth === 0) {
      if (identStart < 0 && /[A-Za-z_$]/.test(c)) {
        identStart = i;
        i++;
        continue;
      }
      if (identStart >= 0 && /[\w$]/.test(c)) {
        i++;
        continue;
      }
      if (identStart >= 0 && c === ":" && body.slice(identStart, i).trim() === key) {
        let j = i + 1;
        while (j < body.length && /\s/.test(body[j])) j++;
        const val = readStringLiteral(body, j);
        if (val !== void 0) return val;
      }
      if (!/[\w$]/.test(c)) identStart = -1;
    }
    i++;
  }
  return void 0;
}
function findActionsBlocks(code) {
  const blocks = [];
  let i = 0;
  let inStr = null;
  let identStart = -1;
  while (i < code.length) {
    const c = code[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      inStr = c;
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      i = nl < 0 ? code.length : nl + 1;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end < 0 ? code.length : end + 2;
      continue;
    }
    if (/[A-Za-z_$]/.test(c) && identStart < 0) {
      identStart = i;
      i++;
      continue;
    }
    if (identStart >= 0 && /[\w$]/.test(c)) {
      i++;
      continue;
    }
    if (identStart >= 0 && c === ":" && code.slice(identStart, i) === "actions") {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      if (code[j] === "{") {
        const end = matchBraceSkipLiterals(code, j);
        if (end > 0) {
          blocks.push(code.slice(j + 1, end));
          i = end + 1;
          identStart = -1;
          continue;
        }
      }
    }
    if (!/[\w$]/.test(c)) identStart = -1;
    i++;
  }
  return blocks;
}
function extractDeclaredActionLabels(code) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  try {
    for (const block of findActionsBlocks(code)) {
      for (const b of scanTopLevelBracedKeys(block)) {
        if (seen.has(b.name)) continue;
        seen.add(b.name);
        const label = topLevelStringValue(b.defBody, "label");
        out.push({ name: b.name, ...label ? { label } : {} });
      }
    }
  } catch {
  }
  return out;
}
function componentActionParameters(validActions) {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: validActions, description: "\u8BED\u4E49\u52A8\u4F5C\u540D\uFF08\u9650\u5DE5\u5177\u8BF4\u660E\u4E2D\u7684\u53EF\u7528\u52A8\u4F5C\u8BCD\u8868\uFF09" },
      selector: { type: "string", description: "\u76EE\u6807\u63A7\u4EF6\uFF1Asnapshot \u91CC\u7684\u5143\u7D20\u7F16\u53F7\uFF0C\u6216 css/xpath \u5B9A\u4F4D\u8868\u8FBE\u5F0F" },
      value: { type: "string", description: "\u4E3B\u8981\u53C2\u6570\uFF08\u5982\u9009\u9879\u6587\u672C\u3001\u65E5\u671F YYYY-MM-DD\uFF09" },
      args: { type: "object", description: "\u9644\u52A0\u53C2\u6570\uFF08\u52A8\u4F5C\u81EA\u5B9A\u4E49\uFF09", additionalProperties: true },
      instruction: { type: "string", description: "\u672C\u6B65\u7684\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF08\u5FC5\u586B\uFF0C\u7528\u4E8E\u843D\u5E93\u4E0E\u56DE\u653E\u81EA\u6108\uFF09" }
    },
    required: ["action", "selector", "instruction"]
  };
}
function buildPluginActionStep(action, locator, instruction, opts) {
  return {
    kind: "action",
    action: "plugin",
    pluginAction: {
      ...opts?.pluginId ? { pluginId: opts.pluginId } : {},
      action,
      ...opts?.label ? { label: opts.label } : {},
      args: { ...opts?.args ?? {}, ...opts?.value != null ? { value: opts.value } : {} }
    },
    locator,
    ...opts?.value != null ? { value: opts.value } : {},
    instruction,
    description: instruction
  };
}

// src/services/pluginStore.ts
var MAX_PLUGIN_BYTES = 512 * 1024;
function validatePluginCode(code) {
  if (code.length > MAX_PLUGIN_BYTES) {
    throw new Error("\u63D2\u4EF6\u4EE3\u7801\u8D85\u8FC7 512KB \u4E0A\u9650");
  }
  try {
    new Function(`return (${code.trim()})`);
  } catch (e) {
    throw new Error(`\u63D2\u4EF6\u4EE3\u7801\u8BED\u6CD5\u9519\u8BEF\uFF1A${e.message ?? e}\uFF08\u6E90\u7801\u9700\u4E3A\u4E00\u4E2A\u6C42\u503C\u63D2\u4EF6\u5B9A\u4E49\u5BF9\u8C61\u7684\u8868\u8FBE\u5F0F\uFF09`);
  }
}
async function actionLabelConflicts(declared, excludeId) {
  const labeled = declared.filter((d) => d.label);
  if (!labeled.length) return [];
  const rows = await prisma.plugin.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { name: true, actions: true }
  });
  const warnings = [];
  const seen = /* @__PURE__ */ new Set();
  for (const d of labeled) {
    for (const p of rows) {
      for (const meta of parseActionMeta(p.actions)) {
        if (meta.name !== d.name || !meta.label || meta.label === d.label) continue;
        const key = `${d.name}|${p.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push(
          `\u52A8\u4F5C ${d.name} \u7684\u5C55\u793A\u540D\u300C${d.label}\u300D\u4E0E\u63D2\u4EF6\u300C${p.name}\u300D\u7684\u300C${meta.label}\u300D\u4E0D\u4E00\u81F4\uFF08\u540C\u540D\u52A8\u4F5C\u8BCD\u8868\u6309\u9884\u8BBE\u4F18\u5148\u7EA7\u53D6\u5148\u58F0\u660E\u63D2\u4EF6\u7684\u5143\u6570\u636E\uFF09`
        );
      }
    }
  }
  return warnings;
}
async function appendBuiltinMembers(presetId) {
  const existing = await prisma.pluginPresetItem.findMany({
    where: { presetId },
    select: { priority: true, plugin: { select: { name: true } } }
  });
  const names = new Set(existing.map((i) => i.plugin.name));
  let priority = existing.reduce((max, i) => Math.max(max, i.priority), -1) + 1;
  const plugins = await prisma.plugin.findMany({
    where: { name: { in: BUILTIN_PRESET_MEMBERS } },
    select: { id: true, name: true }
  });
  const byName = new Map(plugins.map((p) => [p.name, p.id]));
  for (const name of BUILTIN_PRESET_MEMBERS) {
    if (names.has(name)) continue;
    const pluginId = byName.get(name);
    if (!pluginId) continue;
    await prisma.pluginPresetItem.create({ data: { presetId, pluginId, priority: priority++ } });
  }
}
async function normalizeLegacyActionShapes() {
  const rows = await prisma.plugin.findMany({ select: { id: true, actions: true } });
  for (const row of rows) {
    const a = row.actions;
    if (!Array.isArray(a) || !a.some((x) => x && Array.isArray(x.actions))) continue;
    const meta = a.flatMap((x) => Array.isArray(x?.actions) ? x.actions.map((n) => ({ name: String(n) })) : []);
    await prisma.plugin.update({ where: { id: row.id }, data: { actions: meta } });
  }
}
async function ensureBuiltinPlugins() {
  await normalizeLegacyActionShapes();
  for (const def of BUILTIN_PLUGIN_DEFS) {
    await prisma.plugin.upsert({
      where: { name: def.name },
      create: {
        name: def.name,
        version: def.version,
        description: def.description,
        entryFile: def.entryFile,
        source: "builtin",
        builtin: true,
        actions: def.actionsMeta ?? []
      },
      update: {
        version: def.version,
        description: def.description,
        entryFile: def.entryFile,
        builtin: true,
        actions: def.actionsMeta ?? []
      }
    });
  }
  const legacy = await prisma.plugin.findMany({
    where: { name: { in: LEGACY_BUILTIN_NAMES }, source: "builtin" },
    select: { id: true }
  });
  if (legacy.length) {
    const legacyIds = legacy.map((l) => l.id);
    const referencing = await prisma.pluginPresetItem.findMany({
      where: { pluginId: { in: legacyIds } },
      select: { presetId: true },
      distinct: ["presetId"]
    });
    await prisma.plugin.deleteMany({ where: { id: { in: legacyIds } } });
    for (const r of referencing) await appendBuiltinMembers(r.presetId);
  }
  const existing = await prisma.pluginPreset.findUnique({ where: { name: DEFAULT_PRESET_NAME } });
  if (existing) {
    await appendBuiltinMembers(existing.id);
    return;
  }
  const members = await prisma.plugin.findMany({
    where: { name: { in: BUILTIN_PRESET_MEMBERS } },
    select: { id: true, name: true }
  });
  const byName = new Map(members.map((m) => [m.name, m.id]));
  const ordered = BUILTIN_PRESET_MEMBERS.map((n) => byName.get(n)).filter((x) => Boolean(x));
  await prisma.pluginPreset.create({
    data: {
      name: DEFAULT_PRESET_NAME,
      description: "\u5185\u7F6E\u9ED8\u8BA4\u7EC4\u5408\uFF08ant/el \xD7 select / tree-select / date-picker \u80FD\u529B\u63D2\u4EF6\uFF09",
      builtin: true,
      items: { create: ordered.map((pluginId, priority) => ({ pluginId, priority })) }
    }
  });
}
async function enabledPluginRecords(projectId) {
  let presetId = void 0;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { presetId: true }
    });
    presetId = project?.presetId;
  }
  if (!presetId) {
    const fallback = await prisma.pluginPreset.findUnique({
      where: { name: DEFAULT_PRESET_NAME },
      select: { id: true }
    });
    presetId = fallback?.id ?? null;
  }
  if (!presetId) return [];
  const items = await prisma.pluginPresetItem.findMany({
    where: { presetId },
    orderBy: { priority: "asc" },
    include: { plugin: true }
  });
  return items.map((i) => i.plugin);
}
async function enabledInpageScripts(projectId) {
  const records = await enabledPluginRecords(projectId);
  return records.map((p) => ({ id: p.name, code: p.entryFile }));
}
async function enabledActionVocabulary(projectId) {
  const records = await enabledPluginRecords(projectId);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const p of records) {
    for (const meta of parseActionMeta(p.actions)) {
      if (seen.has(meta.name)) continue;
      seen.add(meta.name);
      out.push({ name: meta.name, doc: meta.doc, label: meta.label, preferFill: meta.preferFill, pluginId: p.id, pluginName: p.name });
    }
  }
  return out;
}

// scripts/pluginPwBridge.ts
var PW_HANDLE_NAMES = /* @__PURE__ */ new Set([
  "Locator",
  "FrameLocator",
  "Page",
  "Frame",
  "BrowserContext",
  "Browser",
  "ElementHandle",
  "JSHandle",
  "Keyboard",
  "Mouse",
  "Touchscreen",
  "Request",
  "Response",
  "WebSocket",
  "Route",
  "Worker",
  "Dialog",
  "Download"
]);
var isPwObject = (v) => {
  if (!v || typeof v !== "object") return false;
  const name = String(v.constructor?.name ?? "").replace(/[^A-Za-z0-9]/g, "").replace(/\d+$/, "");
  return PW_HANDLE_NAMES.has(name);
};
var PW_RPC_BINDING = "__ttPwRpc";
var PW_EL_TOKEN_ATTR = "data-__tt-pw";
var MAX_HANDLES = 500;
var PW_EL_TOKEN_TTL_MS = 3e4;
var installed = /* @__PURE__ */ new WeakSet();
async function installPluginPwBridge(target) {
  if (installed.has(target)) return;
  const handles = /* @__PURE__ */ new Map();
  let nextId = 1;
  const keep = (v) => {
    const id = nextId++;
    handles.set(id, v);
    if (handles.size > MAX_HANDLES) {
      const oldest = handles.keys().next().value;
      if (oldest !== void 0) handles.delete(oldest);
    }
    return id;
  };
  const serialize = (v) => {
    if (v === void 0) return null;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "bigint") return String(v);
    if (isPwObject(v)) return { __ttHandle: keep(v), __ttKind: String(v.constructor?.name ?? "PlaywrightObject") };
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  };
  const invoke = async (source, payload) => {
    if (payload?.elToken != null) {
      if (!source?.page) throw new Error("pw(el) \u5143\u7D20\u6CE8\u518C\u5931\u8D25\uFF1A\u6865\u6765\u6E90\u7F3A\u5C11 page");
      const token = String(payload.elToken).replace(/[^a-zA-Z0-9]/g, "");
      const sel = `[${PW_EL_TOKEN_ATTR}="${token}"]`;
      const root = source.page.locator(sel).first();
      const timer = setTimeout(() => {
        root.elementHandle().then((el) => el ? el.evaluate((e) => e.removeAttribute(PW_EL_TOKEN_ATTR)) : void 0).catch(() => {
        });
      }, PW_EL_TOKEN_TTL_MS);
      timer.unref?.();
      return serialize(root);
    }
    const path8 = Array.isArray(payload?.p) ? payload.p.map(String) : [];
    const args = Array.isArray(payload?.a) ? payload.a : [];
    let cur;
    let owner;
    let start;
    if (payload?.b != null) {
      cur = handles.get(Number(payload.b));
      if (!cur) throw new Error("pw \u53E5\u67C4\u5DF2\u5931\u6548\uFF08\u7F13\u5B58\u88AB\u6DD8\u6C70\u6216\u8FDE\u63A5\u5DF2\u66F4\u6362\uFF09\uFF0C\u8BF7\u91CD\u65B0\u5B9A\u4F4D\u540E\u518D\u64CD\u4F5C");
      owner = cur;
      start = 0;
      if (!path8.length) throw new Error("pw \u65E0\u6548\u8C03\u7528\uFF1A\u53E5\u67C4\u5BF9\u8C61\u4E0D\u53EF\u76F4\u63A5\u8C03\u7528\uFF0C\u8BF7\u8C03\u7528\u5176\u65B9\u6CD5\uFF08\u5982 .click() / .count()\uFF09");
    } else {
      const roots = {};
      if (source?.page) roots.page = source.page;
      if (source?.context) roots.context = source.context;
      if (source?.browser) roots.browser = source.browser;
      const rootName = path8[0];
      if (!(rootName in roots)) {
        throw new Error(`pw \u672A\u77E5\u6839\u5BF9\u8C61\uFF1A${rootName}\uFF08\u53EF\u7528\uFF1A${Object.keys(roots).join(" / ") || "\u65E0"}\uFF09`);
      }
      cur = roots[rootName];
      owner = roots;
      start = 1;
    }
    for (let i = start; i < path8.length; i++) {
      owner = cur;
      cur = cur?.[path8[i]];
      if (cur === void 0 || cur === null) {
        throw new Error(`pw \u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${path8.slice(0, i + 1).join(".")}\uFF08pw(el) \u8FD4\u56DE Locator\uFF0C\u53EF\u7528 locator/count/click/fill/textContent/filter/nth/evaluate \u7B49\uFF1BNode \u4FA7\u51FD\u6570\u53C2\u6570\u4E0D\u53EF\u8DE8\u6865\u4F20\u9012\uFF0Cevaluate \u8BF7\u4F20\u5B57\u7B26\u4E32\u8868\u8FBE\u5F0F\uFF09`);
      }
    }
    if (typeof cur !== "function") {
      throw new Error(`pw \u76EE\u6807\u4E0D\u662F\u65B9\u6CD5\uFF1A${path8.join(".")}\uFF08\u5C5E\u6027\u94FE\u672B\u7AEF\u5FC5\u987B\u4EE5\u65B9\u6CD5\u8C03\u7528\u6536\u5C3E\uFF09`);
    }
    return serialize(await cur.apply(owner, args));
  };
  await target.exposeBinding(PW_RPC_BINDING, async (source, payload) => invoke(source, payload));
  installed.add(target);
}

// src/services/locatorVerifier.ts
function resolveQuery(root, loc) {
  switch (loc.strategy) {
    case "role":
      return root.getByRole(loc.role, loc.name ? { name: loc.name } : void 0);
    case "label":
      return root.getByLabel(loc.value);
    case "text":
      return root.getByText(loc.value);
    case "placeholder":
      return root.getByPlaceholder(loc.value);
    case "testid":
      return root.getByTestId(loc.value);
    case "alt":
      return root.getByAltText(loc.value);
    case "title":
      return root.getByTitle(loc.value);
    case "css":
      return root.locator(/^\//.test(loc.value) ? `xpath=${loc.value}` : loc.value);
    case "xpath":
      return root.locator(/^\//.test(loc.value) ? `xpath=${loc.value}` : loc.value);
    default:
      return root.locator(loc.value);
  }
}
var TRANSIENT_CLASS_RE = /(^|-)(focused|open|active|expanded|checked|selected|loading)$|(^|-)status-(success|error|warning|validating)$|^is-(focus|focused|active|open|expanded|checked|selected|error)/;
function stripTransientStateCss(css) {
  return css.replace(
    /\.((?:\\.|[-\w])+)/g,
    (m, cls) => TRANSIENT_CLASS_RE.test(cls.replace(/\\/g, "")) ? "" : m
  );
}
function buildLocatorFromCandidate(c) {
  const loc = c.strategy === "role" ? { strategy: "role", value: c.role ?? c.value, role: c.role, name: c.name } : { strategy: c.strategy, value: c.value };
  if (c.scope) loc.scope = c.scope;
  return loc;
}
async function verifyCandidates(page, target, candidates, opts = {}) {
  const tried = opts.tried ?? [];
  const fallback = opts.fallback ?? false;
  const sameNode = (a, b) => page.evaluate(([x, y]) => !!x && !!y && (x === y || x.isSameNode(y)), [a, b]).catch(() => false);
  for (const c of candidates) {
    let loc;
    try {
      const root = c.scope ? resolveQuery(page, c.scope) : page;
      loc = resolveQuery(root, c);
    } catch {
      tried.push(`${c.strategy}=${c.value}\uFF08\u6784\u9020\u5931\u8D25\uFF09`);
      continue;
    }
    let count;
    try {
      count = await loc.count();
    } catch {
      tried.push(`${c.strategy}=${c.value}\uFF08\u67E5\u8BE2\u5931\u8D25\uFF09`);
      continue;
    }
    tried.push(`${c.strategy}=${c.value}\xD7${count}`);
    if (count !== 1) continue;
    let ok = false;
    if (fallback) {
      ok = true;
    } else {
      const handle = await loc.first().elementHandle().catch(() => null);
      if (!handle) continue;
      try {
        ok = await sameNode(handle, target);
      } catch {
        ok = false;
      }
      if (!ok && (c.role === "checkbox" || c.role === "radio")) {
        ok = await page.evaluate(([x, y]) => {
          if (!x || !y || y.nodeType !== 1) return false;
          const lbl = y.tagName === "LABEL" ? y : y.closest && y.closest("label");
          return !!lbl && !!lbl.contains && lbl.contains(x);
        }, [handle, target]).catch(() => false);
      }
      await handle.dispose().catch(() => {
      });
    }
    if (!ok) continue;
    return { locator: buildLocatorFromCandidate(c), tried };
  }
  if (!fallback && opts.enableRecompute) {
    try {
      const fresh = await page.evaluate((el) => globalThis.__ttPickCss?.(el) ?? null, target);
      if (fresh?.css) {
        const freshRoot = fresh.scope ? resolveQuery(page, fresh.scope) : page;
        const loc = freshRoot.locator(fresh.css);
        const count = await loc.count();
        tried.push(`css(\u5B9E\u65F6\u91CD\u7B97)=${fresh.css}\xD7${count}${fresh.scope ? `@${fresh.scope.strategy}=${fresh.scope.value}` : ""}`);
        if (count === 1) {
          const handle = await loc.first().elementHandle().catch(() => null);
          const same = handle ? await sameNode(handle, target) : false;
          if (handle) await handle.dispose().catch(() => {
          });
          if (same) {
            const locator = { strategy: "css", value: fresh.css };
            if (fresh.scope) locator.scope = fresh.scope;
            return { locator, tried };
          }
        }
      }
    } catch {
    }
  }
  return { tried };
}
async function verifyCandidatesHybrid(page, raw3, candidates, counts, opts = {}) {
  const tried = opts.tried ?? [];
  const res = await page.evaluate(
    (args) => {
      const win = globalThis;
      const doc = win.document;
      const XR = win.XPathResult;
      const [rawS, cands, cnts] = args;
      const target = win.__ttResolve?.(rawS);
      if (!target || target.nodeType !== 1) return { idx: -1, tried: [] };
      const out = [];
      const same = (a, b) => !!a && !!b && (a === b || a.isSameNode(b));
      const scopeRootOf = (scope) => {
        if (!scope) return doc;
        if (scope.strategy === "role") {
          try {
            const els = doc.querySelectorAll('[role="' + scope.value.replace(/"/g, '\\"') + '"]');
            return els.length === 1 ? els[0] : null;
          } catch {
            return null;
          }
        }
        if (scope.strategy === "css") {
          try {
            return doc.querySelector(scope.value);
          } catch {
            return null;
          }
        }
        return null;
      };
      const label = (c) => c.strategy === "role" ? `${c.role} name=${c.name}` : `${c.strategy}=${c.value}`;
      const queryNode = (c) => {
        const root = scopeRootOf(c.scope);
        if (c.scope && !root) return null;
        const q = (sel) => {
          try {
            return root.querySelector(sel);
          } catch {
            return null;
          }
        };
        const escAttr = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        switch (c.strategy) {
          case "testid":
            return q(`[data-testid="${escAttr(c.value)}"]`);
          case "placeholder":
            return q(`[placeholder="${escAttr(c.value)}"]`);
          case "alt":
            return q(`[alt="${escAttr(c.value)}"]`);
          case "title":
            return q(`[title="${escAttr(c.value)}"]`);
          case "css":
            return q(c.value);
          case "xpath": {
            try {
              return doc.evaluate(c.value, root || doc, null, XR.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            } catch {
              return null;
            }
          }
          default:
            return null;
        }
      };
      const EXACT = ["css", "testid", "placeholder", "alt", "title", "xpath"];
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        const cnt = cnts[i];
        if (cnt === 1) {
          if (EXACT.includes(c.strategy)) {
            const node = queryNode(c);
            if (node && same(node, target)) {
              out.push(label(c) + "\xD71");
              return { idx: i, tried: out };
            }
            out.push(label(c) + "\xD71(\u540C\u8282\u70B9\u4E0D\u7B26)");
          } else {
            out.push(label(c) + "\xD71(\u9875\u5185\u8FD1\u4F3C)");
            return { idx: i, tried: out };
          }
        } else {
          out.push(label(c) + "\xD7" + cnt);
        }
      }
      return { idx: -1, tried: out };
    },
    [raw3, candidates, counts]
  ).catch(() => null);
  const r = res;
  if (r?.tried) tried.push(...r.tried);
  if (r && r.idx >= 0 && candidates[r.idx]) {
    return { locator: buildLocatorFromCandidate(candidates[r.idx]), tried };
  }
  return { tried };
}
async function semanticizeLocator(page, raw3, opts = {}) {
  const mode = opts.mode ?? "stagehand";
  try {
    const analyzed = await analyzeElement(page, raw3);
    if (analyzed && analyzed.candidates.length) {
      if (mode === "playwright") {
        const target = await page.evaluateHandle((sel) => globalThis.__ttResolve?.(sel), raw3).catch(() => null);
        if (target) {
          try {
            const r = await verifyCandidates(page, target, analyzed.candidates, {
              enableRecompute: true,
              tried: opts.tried
            });
            if (r.locator) return r.locator;
          } finally {
            await target.dispose().catch(() => {
            });
          }
        }
      } else {
        const r = await verifyCandidatesHybrid(page, raw3, analyzed.candidates, analyzed.counts, { tried: opts.tried });
        if (r.locator) return r.locator;
      }
    }
  } catch {
  }
  return opts.noRawFallback ? void 0 : rawLocatorOf(raw3);
}

// src/services/runnerService.ts
async function projectOfTestCase(testCaseId) {
  const tc = await prisma.testCase.findUnique({ where: { id: testCaseId }, select: { projectId: true } });
  return tc?.projectId ?? null;
}
async function viewportOfTestCase(testCaseId) {
  const tc = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { project: { select: { viewport: true } } }
  });
  return readViewport(tc?.project?.viewport);
}
async function loadEnvMap(testCaseId) {
  const tc = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { project: { select: { envVars: true } } }
  });
  const map = {};
  for (const v of tc?.project?.envVars ?? []) map[v.key] = v.value;
  return map;
}
async function applyLoginState(context, loginConfigId, logs) {
  let storageState;
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true, name: true } });
    if (!cfg) {
      logs.push(`[\u8B66\u544A] \u767B\u5F55\u914D\u7F6E ${loginConfigId} \u4E0D\u5B58\u5728\uFF0C\u4EE5\u672A\u767B\u5F55\u72B6\u6001\u8FD0\u884C`);
    } else {
      storageState = typeof cfg.storageState === "string" ? safeJsonParse(cfg.storageState) : cfg.storageState;
      if (!storageState) {
        logs.push(`[\u8B66\u544A] \u767B\u5F55\u914D\u7F6E\u300C${cfg.name}\u300D\u72B6\u6001\u4E3A\u7A7A\uFF0C\u4EE5\u672A\u767B\u5F55\u72B6\u6001\u8FD0\u884C`);
      } else {
        const origins = (storageState?.origins ?? []).map((o) => o.origin).filter(Boolean);
        const cookies = storageState?.cookies?.length ?? 0;
        logs.push(`[\u767B\u5F55\u914D\u7F6E] \u5DF2\u52A0\u8F7D\u300C${cfg.name}\u300D\uFF08\u6765\u6E90: ${origins.join(", ") || "\u65E0"}\uFF0CCookie: ${cookies}\uFF09`);
      }
    }
  } else {
    logs.push("[\u767B\u5F55\u914D\u7F6E] \u672A\u9009\u62E9\uFF0C\u4EE5\u672A\u767B\u5F55\u72B6\u6001\u8FD0\u884C");
  }
  const ss = storageState;
  if (ss?.cookies?.length) await context.addCookies(ss.cookies);
  const lsOrigins = (ss?.origins ?? []).filter((o) => o?.origin && Array.isArray(o?.localStorage) && o.localStorage.length);
  if (lsOrigins.length) {
    await context.addInitScript(
      (data) => {
        const origin = (data ?? []).find((o) => globalThis.location.origin === o.origin);
        if (origin?.localStorage) {
          for (const { name, value } of origin.localStorage) localStorage.setItem(name, String(value));
        }
      },
      lsOrigins
    );
  }
}
function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return void 0;
  }
}
function substituteStep(step, vars, sysVars, missing) {
  const s = { ...step };
  const sub2 = (t) => substituteAll(t, vars, sysVars, missing);
  s.instruction = sub2(s.instruction);
  s.url = sub2(s.url);
  s.value = sub2(s.value);
  if (s.locator) {
    s.locator = { ...s.locator };
    s.locator.value = sub2(s.locator.value) ?? s.locator.value;
    if (s.locator.name != null) s.locator.name = sub2(s.locator.name) ?? s.locator.name;
    if (s.locator.scope) {
      s.locator.scope = { ...s.locator.scope };
      s.locator.scope.value = sub2(s.locator.scope.value) ?? s.locator.scope.value;
      if (s.locator.scope.name != null) s.locator.scope.name = sub2(s.locator.scope.name) ?? s.locator.scope.name;
    }
  }
  if (s.assertion) {
    s.assertion = { ...s.assertion };
    s.assertion.expected = sub2(s.assertion.expected);
    s.assertion.jsonPath = sub2(s.assertion.jsonPath);
  }
  return s;
}
async function runScript(jobId, params) {
  const selfHeal = params.selfHeal !== false;
  const headless = params.headless === true;
  const run = await prisma.testRun.create({
    data: {
      testCaseId: params.testCaseId,
      scriptId: params.scriptId,
      status: "RUNNING",
      startedAt: /* @__PURE__ */ new Date()
    }
  });
  publish({ type: "run:start", jobId, runId: run.id, testCaseId: params.testCaseId });
  const logs = [];
  const stepUsages = {};
  let pwBrowser;
  let stagehand;
  let shPage;
  let useSelfHeal = selfHeal;
  let cancelled = false;
  let probeFailed = false;
  try {
    initUsage(jobId);
    const envMap = await loadEnvMap(params.testCaseId);
    const sysVars = resolveSystemVars(
      params.steps.flatMap((s) => [s.instruction, s.url, s.value, s.locator?.value, s.locator?.name, s.locator?.scope?.value, s.locator?.scope?.name, s.assertion?.expected, s.assertion?.jsonPath])
    );
    const missingVars = /* @__PURE__ */ new Set();
    const resolvedSteps = params.steps.map((s) => substituteStep(s, envMap, sysVars, missingVars));
    if (missingVars.size) logs.push(`[\u8B66\u544A] \u672A\u5B9A\u4E49\u7684\u73AF\u5883\u53D8\u91CF\uFF1A${[...missingVars].join("\u3001")}`);
    registerCancel(jobId, () => {
      cancelled = true;
      cancelRun(jobId, run.id, logs, stepUsages, async () => {
        if (pwBrowser) {
          try {
            await pwBrowser.close();
          } catch {
          }
        }
        await closeSession(jobId);
      });
    });
    const probeTarget = resolveProbeTarget(resolvedSteps);
    if (probeTarget) {
      try {
        const probeStatus = await probeConnectivity(probeTarget);
        if (probeStatus != null) logs.push(`[\u8FDE\u901A\u6027\u63A2\u6D4B] GET ${probeTarget} \u2192 ${probeStatus}`);
      } catch (e) {
        if (cancelled) return "CANCELLED";
        probeFailed = true;
        throw e;
      }
    }
    if (cancelled) return "CANCELLED";
    const viewport = await viewportOfTestCase(params.testCaseId);
    if (viewport) logs.push(`[\u6D4F\u89C8\u5668\u7A97\u53E3] \u6309\u9879\u76EE\u914D\u7F6E\u4F7F\u7528 ${viewport.width}\xD7${viewport.height}`);
    const rb = await createRunBrowser(jobId, { usageKey: jobId, headless, viewport });
    stagehand = rb.stagehand;
    pwBrowser = await chromium3.connectOverCDP(`http://127.0.0.1:${rb.cdpPort}`);
    const sctx = stagehand.browser.context;
    shPage = await sctx.newPage();
    const pwContext = pwBrowser.contexts()[0];
    for (const p of await pwContext.pages()) {
      if ((await p.url()).startsWith("about:")) {
        try {
          await p.close();
        } catch {
        }
      }
    }
    const page = (await pwContext.pages())[0];
    await applyLoginState(pwContext, params.loginConfigId, logs);
    await pwContext.addInitScript(() => {
      globalThis.close = () => {
      };
    });
    const pluginScripts = await enabledInpageScripts(await projectOfTestCase(params.testCaseId));
    if (pluginScripts.length) {
      await pwContext.addInitScript(buildPluginInitScript(pluginScripts));
      try {
        await installPluginPwBridge(pwContext);
      } catch (e) {
        logs.push(`[\u8B66\u544A] Playwright \u6865\u6CE8\u5165\u5931\u8D25\uFF0C\u63D2\u4EF6\u5185 pw \u4E0D\u53EF\u7528\uFF1A${String(e)}`);
      }
    }
    await pwContext.addInitScript(CANDIDATE_SCRIPT);
    const consoleEntries = [];
    const networkEntries = [];
    const wsEntries = [];
    page.on("console", (msg) => {
      consoleEntries.push({ type: msg.type(), text: msg.text() });
    });
    page.on("response", (res) => {
      try {
        const entry = {
          url: res.url(),
          method: res.request().method(),
          status: res.status(),
          statusText: res.statusText()
        };
        networkEntries.push(entry);
        const ct = res.headers()["content-type"] ?? "";
        if (ct === "" || /(json|text|html|xml|javascript|form-urlencoded)/i.test(ct)) {
          res.text().then((body) => {
            entry.body = body.length > 2e4 ? body.slice(0, 2e4) + "\u2026[\u622A\u65AD]" : body;
          }).catch(() => {
          });
        }
      } catch {
      }
    });
    page.on("websocket", (ws) => {
      const url = ws.url();
      ws.on("framesent", (frame) => {
        wsEntries.push({ url, direction: "sent", payload: String(frame.payload) });
      });
      ws.on("framereceived", (frame) => {
        wsEntries.push({ url, direction: "received", payload: String(frame.payload) });
      });
    });
    let allPass = true;
    for (let i = 0; i < resolvedSteps.length; i++) {
      if (cancelled) break;
      const step = resolvedSteps[i];
      const orig = params.steps[i];
      const started = Date.now();
      let status = "PASSED";
      let message;
      let healed = false;
      let healedLocator;
      try {
        await executeStep(page, step, networkEntries, wsEntries);
      } catch (e) {
        if (useSelfHeal && !cancelled && step.instruction && step.locator?.strategy !== "response" && step.locator?.strategy !== "websocket") {
          const before = { ...getUsage(jobId) };
          try {
            const outcome = await selfHealStep(stagehand, shPage, page, step);
            healed = outcome.healed;
            healedLocator = outcome.locator;
          } catch {
            healed = false;
          }
          const after = getUsage(jobId);
          stepUsages[i] = {
            inputTokens: after.inputTokens - before.inputTokens,
            outputTokens: after.outputTokens - before.outputTokens,
            totalTokens: after.totalTokens - before.totalTokens,
            cachedTokens: after.cachedTokens - before.cachedTokens
          };
        }
        if (healed) {
          status = "PASSED";
          message = "\u5DF2\u81EA\u6108\uFF08\u667A\u80FD\u4F53\u91CD\u65B0\u5B9A\u4F4D\uFF09";
        } else {
          status = "FAILED";
          message = step.action === "assert" ? `\u65AD\u8A00\u5931\u8D25\uFF1A${orig.instruction ?? ""}\uFF08${String(e)}\uFF09` : String(e);
          allPass = false;
        }
      }
      const durationMs = Date.now() - started;
      let screenshot;
      let consoleLog;
      let networkLog;
      if (status === "FAILED") {
        try {
          screenshot = await captureScreenshot(page, run.id, i);
        } catch {
        }
        consoleLog = consoleEntries.length > 0 ? JSON.stringify(consoleEntries) : void 0;
        networkLog = networkEntries.length > 0 ? JSON.stringify(networkEntries) : void 0;
      }
      await prisma.stepResult.create({
        data: { runId: run.id, stepIndex: i, action: step.action, status, message, durationMs, healed, healedLocator: healedLocator ?? prismaNamespace_exports.DbNull, screenshot, consoleLog, networkLog }
      });
      publish({ type: "run:step", jobId, runId: run.id, index: i, status, message, durationMs, healed, usage: stepUsages[i] });
      logs.push(`[${i}] ${step.action} \u2192 ${status}${healed ? "(\u81EA\u6108)" : ""}${message ? `\uFF1A${message}` : ""}`);
    }
    if (cancelled) return "CANCELLED";
    const usage = { ...getUsage(jobId) };
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: allPass ? "PASSED" : "FAILED", finishedAt: /* @__PURE__ */ new Date(), logs: logs.join("\n"), meta: { usage, stepUsages } }
    });
    publish({ type: "run:done", jobId, runId: run.id, status: allPass ? "PASSED" : "FAILED", usage });
    return allPass ? "PASSED" : "FAILED";
  } catch (e) {
    if (cancelled) return "CANCELLED";
    const usage = { ...getUsage(jobId) };
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: /* @__PURE__ */ new Date(), logs: [...logs, String(e)].join("\n"), meta: { usage, stepUsages } }
    });
    publish({ type: "run:done", jobId, runId: run.id, status: "ERROR", message: String(e), usage });
    return probeFailed ? "PROBE_FAILED" : "ERROR";
  } finally {
    unregisterCancel(jobId);
    clearUsage(jobId);
    if (pwBrowser) {
      try {
        await pwBrowser.close();
      } catch {
      }
    }
    if (stagehand) {
      await closeSession(jobId);
    }
  }
}
async function runBatch(jobId, testCaseIds, opts = {}) {
  const total = testCaseIds.length;
  const summary = [];
  for (let i = 0; i < testCaseIds.length; i++) {
    const testCaseId = testCaseIds[i];
    const tc = await prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { scripts: { orderBy: { version: "desc" } } }
    });
    const title = tc?.title ?? testCaseId;
    const requestedId = opts.scriptIds?.[testCaseId] ?? tc?.defaultScriptId ?? void 0;
    const script = tc?.scripts.find((s) => s.id === requestedId) ?? tc?.scripts[0];
    const steps = script?.steps ?? [];
    if (!tc || !script || !steps.length) {
      publish({ type: "batch:case", jobId, testCaseId, title, index: i, total, status: "SKIPPED", message: "\u6CA1\u6709\u53EF\u8FD0\u884C\u7684\u811A\u672C" });
      summary.push({ testCaseId, title, status: "SKIPPED" });
      continue;
    }
    publish({ type: "batch:case", jobId, testCaseId, title, index: i, total, status: "RUNNING" });
    const status = await runScript(jobId, {
      testCaseId,
      scriptId: script.id,
      steps,
      selfHeal: opts.selfHeal,
      loginConfigId: opts.loginConfigId,
      headless: true
      // 批量运行固定无头
    });
    if (status === "PROBE_FAILED") {
      publish({ type: "batch:case", jobId, testCaseId, title, index: i, total, status: "ERROR", message: "\u8FDE\u901A\u6027\u63A2\u6D4B\u5931\u8D25\uFF0C\u5DF2\u7EC8\u6B62\u6279\u91CF\u8FD0\u884C" });
      summary.push({ testCaseId, title, status: "ERROR" });
      const restIds = testCaseIds.slice(i + 1);
      if (restIds.length) {
        const rows = await prisma.testCase.findMany({ where: { id: { in: restIds } }, select: { id: true, title: true } });
        const titleOf = new Map(rows.map((r) => [r.id, r.title]));
        for (let j = i + 1; j < testCaseIds.length; j++) {
          const rid = testCaseIds[j];
          const rtitle = titleOf.get(rid) ?? rid;
          publish({ type: "batch:case", jobId, testCaseId: rid, title: rtitle, index: j, total, status: "SKIPPED", message: "\u5DF2\u8DF3\u8FC7\uFF1A\u8FDE\u901A\u6027\u63A2\u6D4B\u5931\u8D25" });
          summary.push({ testCaseId: rid, title: rtitle, status: "SKIPPED" });
        }
      }
      break;
    }
    publish({ type: "batch:case", jobId, testCaseId, title, index: i, total, status });
    summary.push({ testCaseId, title, status });
    if (status === "CANCELLED") break;
  }
  publish({ type: "batch:done", jobId, summary });
}
async function captureScreenshot(page, runId, stepIndex) {
  const dir = getScreenshotDir();
  const filename = `${runId}_${stepIndex}.png`;
  await page.screenshot({ path: path4.join(dir, filename), type: "png", fullPage: true });
  return filename;
}
function buildLocator(page, loc) {
  if (!loc) throw new Error("\u6B65\u9AA4\u7F3A\u5C11\u5B9A\u4F4D\u5668");
  const root = loc.scope ? resolveQuery(page, loc.scope) : page;
  return resolveQuery(root, loc);
}
async function resolveStepLocator(page, step) {
  const loc = buildLocator(page, step.locator);
  if (step.locator?.strategy !== "css") return loc;
  try {
    if (await loc.count() > 0) return loc;
  } catch {
    return loc;
  }
  const stripped = stripTransientStateCss(step.locator.value);
  if (!stripped || stripped === step.locator.value) return loc;
  try {
    const strippedLoc = buildLocator(page, { ...step.locator, value: stripped });
    return await strippedLoc.count() === 1 ? strippedLoc : loc;
  } catch {
    return loc;
  }
}
async function executeStep(page, step, networkEntries, wsEntries) {
  switch (step.action) {
    case "goto":
      if (!step.url) throw new Error("goto \u7F3A\u5C11 url");
      await page.goto(step.url);
      break;
    case "click":
      await (await resolveStepLocator(page, step)).click({ timeout: 1e4 });
      break;
    case "fill":
      await (await resolveStepLocator(page, step)).fill(step.value ?? "", { timeout: 1e4 });
      break;
    case "press":
      await (await resolveStepLocator(page, step)).press(step.key ?? "Enter", { timeout: 1e4 });
      break;
    case "check":
      await (await resolveStepLocator(page, step)).check({ timeout: 1e4 });
      break;
    case "select":
      await (await resolveStepLocator(page, step)).selectOption(step.value ?? "", { timeout: 1e4 });
      break;
    case "assert":
      await runAssertion(page, step, networkEntries, wsEntries);
      break;
    case "wait":
      await page.waitForTimeout(step.value ? Number(step.value) : 1e3);
      break;
    case "plugin": {
      const pa = step.pluginAction;
      if (!pa?.action) throw new Error("plugin \u6B65\u9AA4\u7F3A\u5C11 pluginAction\uFF08action\uFF09");
      let handle = step.locator ? await (await resolveStepLocator(page, step)).elementHandle({ timeout: 1e4 }).catch(() => null) : null;
      const runChainInPage = page.evaluate(
        async ([act, target, actionArgs, hintId]) => {
          const reg = globalThis.__ttPluginRegistry__;
          if (!reg) throw new Error("\u9875\u9762\u672A\u6CE8\u5165\u63D2\u4EF6\u8FD0\u884C\u65F6\uFF1A\u8BF7\u68C0\u67E5\u9879\u76EE\u7684\u7EC4\u4EF6\u9884\u8BBE");
          const el = target && target.isConnected ? target : null;
          if (!el && !actionArgs?.allowNoElement) throw new Error("\u76EE\u6807\u5143\u7D20\u672A\u547D\u4E2D\u4E14\u672A\u58F0\u660E allowNoElement");
          const chain = el ? reg.resolveChain(el, act) : [];
          const ordered = [...hintId ? [hintId] : [], ...chain.map((c) => c.id).filter((id) => id !== hintId)];
          const attempted = [];
          let last = "";
          for (const pid of ordered) {
            attempted.push(pid);
            try {
              const r = await reg.invokeAction(pid, act, el, actionArgs ?? {});
              if (r && typeof r === "object" && r.status === "failed") {
                last = r.message || last;
                continue;
              }
              return typeof r === "object" && r != null ? String(r.message ?? "") : String(r ?? "");
            } catch (e) {
              last = String(e && e.message || e);
            }
          }
          throw new Error(`\u8BED\u4E49\u52A8\u4F5C ${act} \u5728\u63D2\u4EF6\u94FE\u4E0A\u5168\u90E8\u5931\u8D25\uFF08\u5C1D\u8BD5\uFF1A${attempted.join(" \u2192 ") || "\u65E0\u5339\u914D\u63D2\u4EF6"}\uFF09\u3002${last}`);
        },
        [pa.action, handle, pa.args ?? {}, pa.pluginId ?? null]
      );
      try {
        await Promise.race([
          runChainInPage,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`\u8BED\u4E49\u52A8\u4F5C ${pa.action} \u63D2\u4EF6\u94FE\u6267\u884C\u8D85\u65F6\uFF0830s\uFF09`)), 3e4))
        ]);
      } catch (chainErr) {
        try {
          if (!step.locator) throw chainErr;
          const fallbackLoc = await resolveStepLocator(page, step);
          if (pa.action === "select" && step.value != null) {
            await fallbackLoc.selectOption(step.value, { timeout: 1e4 });
          } else if (step.value != null) {
            await fallbackLoc.fill(step.value, { timeout: 1e4 });
            await page.keyboard.press("Enter");
          } else {
            await fallbackLoc.click({ timeout: 1e4 });
          }
        } catch {
          throw chainErr;
        }
      }
      break;
    }
    case "raw":
      break;
    default:
      throw new Error(`\u672A\u77E5\u52A8\u4F5C\uFF1A${step.action}`);
  }
}
async function runAssertion(page, step, networkEntries, wsEntries) {
  const a = step.assertion;
  if (!a) throw new Error("\u65AD\u8A00\u7F3A\u5C11\u6761\u4EF6");
  if (step.locator?.strategy === "response") {
    await runResponseAssertion(step.locator.value, a, networkEntries);
    return;
  }
  if (step.locator?.strategy === "websocket") {
    await runWebsocketAssertion(step.locator.value, a, wsEntries);
    return;
  }
  if (a.type === "url") {
    const url = page.url();
    if (a.expected && !url.includes(a.expected)) throw new Error(`URL \u65AD\u8A00\u5931\u8D25\uFF1A\u5F53\u524D ${url}\uFF0C\u671F\u671B\u542B\u300C${a.expected}\u300D`);
    return;
  }
  if (a.type === "hidden" && !step.locator) return;
  if (a.type === "text" && !step.locator) {
    const expected = a.expected ?? "";
    if (!expected) return;
    for (let i = 0; i < 50; i++) {
      const body = await page.locator("body").textContent() ?? "";
      if (body.includes(expected)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`\u6587\u672C\u65AD\u8A00\u5931\u8D25\uFF1A\u9875\u9762\u672A\u5305\u542B\u300C${expected}\u300D`);
  }
  const loc = buildLocator(page, step.locator);
  if (a.type === "visible") {
    await loc.waitFor({ state: "visible", timeout: 1e4 });
  } else if (a.type === "hidden") {
    await loc.waitFor({ state: "hidden", timeout: 1e4 });
  } else if (a.type === "text") {
    await loc.waitFor({ state: "visible", timeout: 1e4 });
    const text = await loc.textContent() ?? "";
    if (a.expected && !text.includes(a.expected)) throw new Error(`\u6587\u672C\u65AD\u8A00\u5931\u8D25\uFF1A\u5B9E\u9645\u300C${text}\u300D\uFF0C\u671F\u671B\u542B\u300C${a.expected}\u300D`);
  }
}
async function runResponseAssertion(urlMatch, a, networkEntries) {
  if (!urlMatch) throw new Error("\u63A5\u53E3\u54CD\u5E94\u65AD\u8A00\u7F3A\u5C11 URL \u5339\u914D\u4E32");
  const needBody = a.type === "response_body" || a.type === "response_json";
  const matched = await findMatchedResponse(urlMatch, needBody, networkEntries);
  if (!matched) throw new Error(`\u672A\u627E\u5230\u5339\u914D\u300C${urlMatch}\u300D\u7684\u63A5\u53E3\u54CD\u5E94`);
  if (a.type === "response_status") {
    const expected = a.expected?.trim();
    if (expected && !String(matched.status).includes(expected)) {
      throw new Error(`\u72B6\u6001\u7801\u65AD\u8A00\u5931\u8D25\uFF1A\u5B9E\u9645 ${matched.status}\uFF0C\u671F\u671B\u542B\u300C${expected}\u300D`);
    }
    return;
  }
  if (a.type === "response_body") {
    const body = matched.body ?? "";
    if (a.expected && !body.includes(a.expected)) {
      throw new Error(`\u54CD\u5E94\u4F53\u65AD\u8A00\u5931\u8D25\uFF1A\u54CD\u5E94\u4F53\u672A\u5305\u542B\u300C${a.expected}\u300D`);
    }
    return;
  }
  if (matched.body === void 0) throw new Error("\u54CD\u5E94\u4F53\u672A\u91C7\u96C6\u5230\uFF0C\u65E0\u6CD5\u6309 JSON \u5B57\u6BB5\u65AD\u8A00");
  let json;
  try {
    json = JSON.parse(matched.body);
  } catch {
    throw new Error("\u54CD\u5E94\u4F53\u975E\u5408\u6CD5 JSON\uFF0C\u65E0\u6CD5\u6309\u5B57\u6BB5\u65AD\u8A00");
  }
  const actual = getByPath(json, a.jsonPath ?? "");
  if (a.expected != null && String(actual) !== a.expected) {
    throw new Error(`JSON \u5B57\u6BB5\u65AD\u8A00\u5931\u8D25\uFF1A\u5B57\u6BB5\u300C${a.jsonPath}\u300D\u5B9E\u9645\u300C${String(actual)}\u300D\uFF0C\u671F\u671B\u300C${a.expected}\u300D`);
  }
}
async function findMatchedResponse(urlMatch, needBody, networkEntries) {
  const find = (requireBody) => [...networkEntries].reverse().find((e) => e.url.includes(urlMatch) && (!requireBody || e.body !== void 0));
  let matched = find(needBody);
  for (let i = 0; i < 100 && !matched; i++) {
    await new Promise((r) => setTimeout(r, 50));
    matched = find(needBody);
  }
  return matched ?? find(false);
}
function getByPath(obj, path8) {
  if (!path8) return obj;
  let cur = obj;
  for (const seg of path8.split(".")) {
    if (cur == null || typeof cur !== "object") return void 0;
    cur = cur[seg];
  }
  return cur;
}
async function runWebsocketAssertion(urlMatch, a, wsEntries) {
  if (!urlMatch) throw new Error("WebSocket \u65AD\u8A00\u7F3A\u5C11 URL \u5339\u914D\u4E32");
  const direction = a.type === "ws_sent" ? "sent" : "received";
  const expected = a.expected ?? "";
  const jsonPath = a.jsonPath;
  const match = (payload) => {
    if (!expected) return true;
    if (jsonPath) {
      try {
        return String(getByPath(JSON.parse(payload), jsonPath)) === expected;
      } catch {
        return false;
      }
    }
    return payload.includes(expected);
  };
  const found = await findMatchedWsFrame(urlMatch, direction, match, wsEntries);
  if (found) return;
  const last = [...wsEntries].reverse().find((e) => e.url.includes(urlMatch) && e.direction === direction);
  const dirLabel = direction === "sent" ? "\u53D1\u9001" : "\u63A5\u6536";
  const hint = last ? `\uFF0C\u6700\u8FD1\u4E00\u6761\u6D88\u606F\uFF1A${last.payload.slice(0, 200)}` : `\uFF0C\u672A\u91C7\u96C6\u5230\u5339\u914D\u300C${urlMatch}\u300D\u7684 ${dirLabel} \u6D88\u606F`;
  throw new Error(`WebSocket ${dirLabel}\u65AD\u8A00\u5931\u8D25\uFF1A\u672A\u627E\u5230\u5305\u542B\u300C${expected}\u300D\u7684\u6D88\u606F${hint}`);
}
async function findMatchedWsFrame(urlMatch, direction, predicate, wsEntries) {
  const find = () => wsEntries.find((e) => e.url.includes(urlMatch) && e.direction === direction && predicate(e.payload));
  let matched = find();
  for (let i = 0; i < 100 && !matched; i++) {
    await new Promise((r) => setTimeout(r, 50));
    matched = find();
  }
  return matched;
}
async function selfHealStep(stagehand, shPage, page, step) {
  if (!step.instruction) return { healed: false };
  const semantic = async (sel) => sel ? semanticizeLocator(page, sel, { mode: "playwright" }) : void 0;
  try {
    if (step.action === "assert") {
      if (step.assertion?.type === "url") return { healed: false };
      if (step.assertion?.type === "hidden") return { healed: false };
      const { data: actions } = await stagehand.observe(step.instruction, { page: shPage });
      if (Array.isArray(actions) && actions.length > 0) {
        const locator = await semantic(actions[0]?.selector);
        if (step.assertion?.type === "text" && step.assertion.expected && locator) {
          const text = await buildLocator(page, locator).textContent() ?? "";
          if (!text.includes(step.assertion.expected)) return { healed: false };
        }
        return { healed: true, locator };
      }
      return { healed: false };
    }
    const res = await stagehand.act(step.instruction, { page: shPage });
    if (res?.data?.success && Array.isArray(res.data.actions) && res.data.actions.length > 0) {
      return { healed: true, locator: await semantic(res.data.actions[0]?.selector) };
    }
    return { healed: false };
  } catch {
    return { healed: false };
  }
}
async function cancelRun(jobId, runId, logs, stepUsages, close) {
  try {
    await close();
  } catch {
  }
  const usage = { ...getUsage(jobId) };
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", finishedAt: /* @__PURE__ */ new Date(), logs: [...logs, "\u7528\u6237\u53D6\u6D88"].join("\n"), meta: { usage, stepUsages } }
  });
  publish({ type: "run:done", jobId, runId, status: "CANCELLED", usage });
}

// src/routes/runs.ts
async function cleanupScreenshots(runIds) {
  if (!runIds.length) return 0;
  const dir = getScreenshotDir();
  const escaped = new Set(runIds.map((id) => `${id}_`));
  let entries;
  try {
    entries = await fs3.promises.readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!name.endsWith(".png")) continue;
    if (![...escaped].some((prefix) => name.startsWith(prefix))) continue;
    try {
      await fs3.promises.unlink(path5.join(dir, name));
      removed++;
    } catch (e) {
      console.warn(`[runs] \u5220\u9664\u622A\u56FE\u5931\u8D25 ${name}:`, e);
    }
  }
  return removed;
}
async function runRoutes(app2) {
  app2.get(
    "/api/runs",
    async () => prisma.testRun.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { testCase: { select: { id: true, title: true } } }
    })
  );
  app2.post("/api/runs", async (req) => {
    const { testCaseId, scriptId, steps, selfHeal, headless, loginConfigId } = req.body ?? {};
    if (!testCaseId || !Array.isArray(steps)) return { error: "\u7F3A\u5C11 testCaseId \u6216 steps" };
    const jobId = randomUUID();
    runScript(jobId, { testCaseId, scriptId, steps, selfHeal, headless, loginConfigId }).catch(
      (e) => publish({ type: "run:done", jobId, status: "ERROR", message: String(e) })
    );
    return { jobId };
  });
  app2.post("/api/runs/batch", async (req) => {
    const { testCaseIds, selfHeal, loginConfigId, scriptIds } = req.body ?? {};
    if (!Array.isArray(testCaseIds) || !testCaseIds.length) return { error: "\u7F3A\u5C11 testCaseIds" };
    const jobId = randomUUID();
    runBatch(jobId, testCaseIds, { selfHeal, loginConfigId, scriptIds }).catch(
      (e) => publish({ type: "batch:done", jobId, status: "ERROR", message: String(e) })
    );
    return { jobId };
  });
  app2.get(
    "/api/test-cases/:testCaseId/runs",
    async (req) => prisma.testRun.findMany({
      where: { testCaseId: req.params.testCaseId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { stepResults: true } } }
    })
  );
  app2.get("/api/runs/:id", async (req, reply) => {
    const run = await prisma.testRun.findUnique({
      where: { id: req.params.id },
      include: { stepResults: { orderBy: { stepIndex: "asc" } }, script: true, testCase: true }
    });
    if (!run) return reply.code(404).send({ error: "\u8FD0\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" });
    return run;
  });
  app2.post("/api/runs/:id/adopt", async (req, reply) => {
    const { id } = req.params;
    const { stepIndex } = req.body ?? {};
    if (stepIndex == null || !Number.isInteger(stepIndex) || stepIndex < 0) {
      return reply.code(400).send({ error: "\u7F3A\u5C11\u6709\u6548\u7684 stepIndex" });
    }
    const run = await prisma.testRun.findUnique({
      where: { id },
      include: { stepResults: { where: { stepIndex } } }
    });
    if (!run) return reply.code(404).send({ error: "\u8FD0\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" });
    const sr = run.stepResults[0];
    if (!sr) return reply.code(404).send({ error: "\u6B65\u9AA4\u7ED3\u679C\u4E0D\u5B58\u5728" });
    if (!sr.healed || !sr.healedLocator) {
      return reply.code(400).send({ error: "\u8BE5\u6B65\u9AA4\u672A\u81EA\u6108\u6216\u65E0\u65B0\u5B9A\u4F4D\u5668\uFF0C\u65E0\u6CD5\u91C7\u7EB3" });
    }
    if (!run.scriptId) return reply.code(400).send({ error: "\u8BE5\u8FD0\u884C\u672A\u5173\u8054\u811A\u672C\uFF0C\u65E0\u6CD5\u91C7\u7EB3" });
    const script = await prisma.testScript.findUnique({ where: { id: run.scriptId } });
    if (!script) return reply.code(404).send({ error: "\u5173\u8054\u811A\u672C\u4E0D\u5B58\u5728" });
    const steps = (script.steps ?? []).map((s) => ({ ...s }));
    if (stepIndex >= steps.length) return reply.code(400).send({ error: "\u6B65\u9AA4\u7D22\u5F15\u8D8A\u754C\uFF0C\u811A\u672C\u5DF2\u53D8\u66F4" });
    if (steps[stepIndex].action !== sr.action) {
      return reply.code(409).send({ error: "\u811A\u672C\u5DF2\u53D8\u66F4\uFF0C\u8BE5\u6B65\u9AA4\u4E0D\u518D\u5BF9\u5E94\uFF0C\u65E0\u6CD5\u91C7\u7EB3\uFF08\u8BF7\u91CD\u65B0\u8FD0\u884C\uFF09" });
    }
    steps[stepIndex] = { ...steps[stepIndex], locator: sr.healedLocator };
    await prisma.testScript.update({ where: { id: script.id }, data: { steps } });
    return { ok: true, scriptId: script.id, version: script.version, stepIndex };
  });
  app2.get("/api/screenshots/:filename", async (req, reply) => {
    const { filename } = req.params;
    if (!/^[a-zA-Z0-9_\-]+\.png$/.test(filename)) {
      return reply.code(400).send({ error: "\u65E0\u6548\u7684\u6587\u4EF6\u540D" });
    }
    const filePath = path5.join(getScreenshotDir(), filename);
    if (!fs3.existsSync(filePath)) return reply.code(404).send({ error: "\u622A\u56FE\u4E0D\u5B58\u5728" });
    const data = await fs3.promises.readFile(filePath);
    return reply.type("image/png").send(data);
  });
  app2.delete("/api/runs/:id", async (req) => {
    const { id } = req.params;
    await cleanupScreenshots([id]);
    await prisma.testRun.delete({ where: { id } });
    return { ok: true };
  });
  app2.delete("/api/runs", async () => {
    const ids = await prisma.testRun.findMany({ select: { id: true } });
    const files = await cleanupScreenshots(ids.map((r) => r.id));
    const { count } = await prisma.testRun.deleteMany();
    return { ok: true, count, files };
  });
  app2.delete("/api/test-cases/:testCaseId/runs", async (req) => {
    const { testCaseId } = req.params;
    const ids = await prisma.testRun.findMany({ where: { testCaseId }, select: { id: true } });
    const files = await cleanupScreenshots(ids.map((r) => r.id));
    const { count } = await prisma.testRun.deleteMany({ where: { testCaseId } });
    return { ok: true, count, files };
  });
}

// src/routes/projects.ts
async function projectRoutes(app2) {
  app2.get(
    "/api/projects",
    async () => prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { testCases: true } } }
    })
  );
  app2.post("/api/projects", async (req, reply) => {
    const { name, baseUrl, presetId } = req.body ?? {};
    if (!name) return reply.code(400).send({ error: "\u7F3A\u5C11\u9879\u76EE\u540D\u79F0" });
    if (presetId) {
      const preset2 = await prisma.pluginPreset.findUnique({ where: { id: presetId }, select: { id: true } });
      if (!preset2) return reply.code(400).send({ error: "\u9884\u8BBE\u4E0D\u5B58\u5728" });
    }
    let finalPresetId = presetId ?? null;
    if (!finalPresetId) {
      const def = await prisma.pluginPreset.findUnique({ where: { name: DEFAULT_PRESET_NAME }, select: { id: true } });
      finalPresetId = def?.id ?? null;
    }
    return prisma.project.create({ data: { name, baseUrl, ...finalPresetId ? { presetId: finalPresetId } : {} } });
  });
  app2.get("/api/projects/:id", async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        testCases: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            _count: { select: { scripts: true, runs: true } },
            // 版本列表（仅 id/version），供用例列表「版本」列选择批量运行的脚本版本。
            scripts: { select: { id: true, version: true }, orderBy: { version: "desc" } }
          }
        },
        loginConfigs: { select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: "desc" } }
      }
    });
    if (!project) return reply.code(404).send({ error: "\u9879\u76EE\u4E0D\u5B58\u5728" });
    return project;
  });
  app2.put("/api/projects/:id", async (req, reply) => {
    const { id } = req.params;
    const { name, baseUrl, presetId, viewport } = req.body ?? {};
    if (presetId) {
      const preset2 = await prisma.pluginPreset.findUnique({ where: { id: presetId }, select: { id: true } });
      if (!preset2) return { error: "\u9884\u8BBE\u4E0D\u5B58\u5728" };
    }
    let viewportData;
    if (viewport !== void 0) {
      viewportData = parseViewport(viewport);
      if (viewportData === void 0) return reply.code(400).send({ error: "viewport \u9700\u4E3A {width, height} \u6570\u5B57\u5BF9\u8C61\u6216 null" });
    }
    const viewportInput = viewportData === void 0 ? void 0 : viewportData === null ? prismaNamespace_exports.DbNull : viewportData;
    return prisma.project.update({
      where: { id },
      data: {
        name,
        baseUrl,
        // 显式传 null 表示清除关联（回落全部插件注入）；未传则不动
        ...presetId !== void 0 ? { presetId: presetId || null } : {},
        ...viewportInput !== void 0 ? { viewport: viewportInput } : {}
      }
    });
  });
  app2.delete("/api/projects/:id", async (req) => {
    const { id } = req.params;
    const runs = await prisma.testRun.findMany({
      where: { testCase: { projectId: id } },
      select: { id: true }
    });
    await cleanupScreenshots(runs.map((r) => r.id));
    await prisma.project.delete({ where: { id } });
    return { ok: true };
  });
  app2.get("/api/projects/:id/env-vars", async (req, reply) => {
    const { id } = req.params;
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: "\u9879\u76EE\u4E0D\u5B58\u5728" });
    return prisma.envVar.findMany({
      where: { projectId: id },
      orderBy: { key: "asc" }
    });
  });
  app2.put("/api/projects/:id/env-vars", async (req, reply) => {
    const { id } = req.params;
    const { vars } = req.body ?? {};
    if (!Array.isArray(vars)) return reply.code(400).send({ error: "\u7F3A\u5C11 vars" });
    const dedup = /* @__PURE__ */ new Map();
    for (const v of vars) {
      const key = (v?.key ?? "").trim();
      if (!key || !isValidVarName(key)) continue;
      dedup.set(key, v?.value ?? "");
    }
    const rows = [...dedup.entries()].map(([key, value]) => ({ projectId: id, key, value }));
    await prisma.$transaction([
      prisma.envVar.deleteMany({ where: { projectId: id } }),
      ...rows.map((r) => prisma.envVar.create({ data: r }))
    ]);
    return prisma.envVar.findMany({ where: { projectId: id }, orderBy: { key: "asc" } });
  });
}

// src/routes/testCases.ts
import { z as z2 } from "zod";

// src/shared/testScript.ts
import { z } from "zod";
var locatorScopeSchema = z.object({
  strategy: z.enum(["role", "testid", "label", "placeholder", "text", "alt", "title", "css"]),
  value: z.string(),
  role: z.string().optional(),
  name: z.string().optional()
});
var locatorSchema = z.object({
  strategy: z.enum(["role", "label", "text", "placeholder", "testid", "alt", "title", "css", "xpath", "response", "websocket"]),
  value: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  scope: locatorScopeSchema.optional()
});
var testStepSchema = z.object({
  instruction: z.string().optional(),
  // 模块①：LLM 拆出的自然语言子指令；模块②：人类可读描述
  kind: z.enum(["navigate", "action", "assert", "wait"]).default("action"),
  action: z.enum(["goto", "click", "fill", "press", "check", "select", "assert", "wait", "raw", "plugin"]),
  /// 语义动作步骤（action='plugin' 时必填）：action 为语义动作名；pluginId 为生成期命中的插件提示
  /// （可选，回放按语义动作链重匹配时仅作优先尝试）；args 为动作参数。
  pluginAction: z.object({
    pluginId: z.string().optional(),
    action: z.string(),
    /** 插件声明的展示名（落库时随步骤戳入，供状态标签/导出等展示点直接取用）。 */
    label: z.string().optional(),
    // 值放宽为 any：自由参数对象需兼容 Prisma Json 写入（unknown 会破坏 InputJsonObject 约束）
    args: z.record(z.string(), z.any()).optional()
  }).optional(),
  locator: locatorSchema.optional(),
  url: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  assertion: z.object({
    type: z.enum(["visible", "hidden", "text", "url", "response_status", "response_body", "response_json", "ws_sent", "ws_received"]),
    expected: z.string().optional(),
    jsonPath: z.string().optional()
    // type='response_json' 时的字段点分路径，如 data.id
  }).optional(),
  code: z.string().optional(),
  // action='raw' 时保留的原始代码行
  description: z.string().optional()
});
var testScriptSchema = z.object({
  name: z.string(),
  steps: z.array(testStepSchema)
});
var REVISE_OPS_MAX = 20;
function applyReviseOps(steps, ops) {
  if (!Array.isArray(ops) || !ops.length) return "ops \u4E0D\u80FD\u4E3A\u7A7A\uFF1A\u81F3\u5C11\u7ED9\u51FA\u4E00\u4E2A update/delete \u64CD\u4F5C";
  if (ops.length > REVISE_OPS_MAX) return `ops \u8FC7\u591A\uFF08${ops.length} \u9879\uFF09\uFF1A\u5355\u6B21\u6700\u591A ${REVISE_OPS_MAX} \u9879\u64CD\u4F5C`;
  const working = [...steps];
  let updated = 0;
  let deleted = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const err = (msg) => `\u7B2C ${i + 1} \u9879\u64CD\u4F5C\u65E0\u6548\uFF1A${msg}`;
    if (!op || typeof op !== "object") return err("\u64CD\u4F5C\u5FC5\u987B\u662F\u5BF9\u8C61");
    if (op.op === "update") {
      const at = op.step;
      if (!Number.isInteger(at) || at < 1 || at > working.length) {
        return err(`\u7B2C ${at} \u6B65\u4E0D\u5B58\u5728\uFF08\u5F53\u524D\u5171 ${working.length} \u6B65\uFF1B\u6CE8\u610F\u5148\u5220\u540E\u6539\u4F1A\u4F7F\u5E8F\u53F7\u79FB\u4F4D\uFF09`);
      }
      if (op.value == null && op.key == null && op.instruction == null && op.expected == null) {
        return err(`update \u81F3\u5C11\u7ED9\u51FA value/key/instruction/expected \u4E2D\u7684\u4E00\u4E2A\u5F85\u6539\u5B57\u6BB5`);
      }
      const target = working[at - 1];
      const next = { ...target };
      if (op.value != null) next.value = String(op.value);
      if (op.key != null) next.key = String(op.key);
      if (op.instruction != null) {
        next.instruction = String(op.instruction);
        next.description = String(op.instruction);
      }
      if (op.expected != null) {
        if (target.kind !== "assert") return err(`expected \u4EC5\u7528\u4E8E\u65AD\u8A00\u6B65\uFF1A\u7B2C ${at} \u6B65\u662F ${target.kind === "navigate" ? "\u5BFC\u822A" : "\u52A8\u4F5C"}\u6B65`);
        next.assertion = { ...target.assertion, expected: String(op.expected) };
      }
      working[at - 1] = next;
      updated++;
    } else if (op.op === "delete") {
      const from = op.from;
      const to = op.to ?? op.from;
      if (!Number.isInteger(from) || from < 1 || from > working.length) {
        return err(`\u8D77\u59CB\u6B65 ${from} \u4E0D\u5B58\u5728\uFF08\u5F53\u524D\u5171 ${working.length} \u6B65\uFF09`);
      }
      if (!Number.isInteger(to) || to < from || to > working.length) {
        return err(`\u5220\u9664\u8303\u56F4 ${from}~${to} \u65E0\u6548\uFF08\u5F53\u524D\u5171 ${working.length} \u6B65\uFF09`);
      }
      working.splice(from - 1, to - from + 1);
      deleted += to - from + 1;
    } else {
      return err(`\u672A\u77E5\u64CD\u4F5C\u7C7B\u578B\u300C${op?.op}\u300D\uFF08\u4EC5\u652F\u6301 update/delete\uFF09`);
    }
  }
  return { steps: working, updated, deleted };
}
function revokeStepRange(segments, from, to) {
  const total = segments.reduce((n, seg) => n + seg.length, 0);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > total) {
    return `\u64A4\u9500\u8303\u56F4 ${from}~${to} \u65E0\u6548\uFF08\u5F53\u524D\u811A\u672C\u5171 ${total} \u6B65\uFF0C\u8303\u56F4\u987B\u4E3A 1~${total} \u7684\u5347\u5E8F\u6574\u6570\uFF09`;
  }
  let base = 0;
  for (const seg of segments) {
    const size = seg.length;
    const segFrom = Math.max(from - base, 1);
    const segTo = Math.min(to - base, size);
    if (segFrom <= segTo) seg.splice(segFrom - 1, segTo - segFrom + 1);
    base += size;
  }
  return null;
}
function sameLocator(a, b) {
  if (!a || !b) return false;
  return a.strategy === b.strategy && a.value === b.value && a.role === b.role && a.name === b.name && (a.scope && b.scope ? sameLocator(a.scope, b.scope) : !a.scope && !b.scope);
}
function absorbProbeClick(steps, pluginStep) {
  if (pluginStep.kind !== "action" || pluginStep.action !== "plugin" || !steps.length) return null;
  const prev = steps[steps.length - 1];
  if (prev.kind !== "action" || prev.action !== "click" || !sameLocator(prev.locator, pluginStep.locator)) return null;
  steps.pop();
  return steps.length + 1;
}

// src/routes/testCases.ts
async function testCaseRoutes(app2) {
  app2.get(
    "/api/projects/:projectId/test-cases",
    async (req) => prisma.testCase.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { scripts: true, runs: true } } }
    })
  );
  app2.post("/api/projects/:projectId/test-cases", async (req, reply) => {
    const { projectId } = req.params;
    const { title, description, naturalLanguage } = req.body ?? {};
    if (!title) return reply.code(400).send({ error: "\u7F3A\u5C11\u7528\u4F8B\u6807\u9898" });
    return prisma.testCase.create({
      data: { projectId, title, description, naturalLanguage }
    });
  });
  app2.post("/api/projects/:projectId/test-cases/import", async (req, reply) => {
    const { projectId } = req.params;
    const body = req.body ?? {};
    if (!body.title) return reply.code(400).send({ error: "\u7F3A\u5C11\u7528\u4F8B\u6807\u9898" });
    const stepsResult = z2.array(testStepSchema).safeParse(body.steps);
    if (!stepsResult.success) return reply.code(400).send({ error: "\u6B65\u9AA4\u6570\u636E\u683C\u5F0F\u4E0D\u6B63\u786E" });
    return prisma.$transaction(async (tx) => {
      const tc = await tx.testCase.create({
        data: { projectId, title: body.title, description: body.description ?? null, naturalLanguage: body.naturalLanguage ?? null }
      });
      await tx.testScript.create({
        data: { testCaseId: tc.id, version: 1, steps: stepsResult.data, rawCode: body.rawCode ?? null }
      });
      return tc;
    });
  });
  app2.get("/api/test-cases/:id", async (req, reply) => {
    const tc = await prisma.testCase.findUnique({
      where: { id: req.params.id },
      include: {
        // 仅取环境变量键（值属敏感数据，步骤编辑器只需键做 {{var}} 校验）
        project: {
          include: {
            envVars: { select: { key: true } },
            loginConfigs: { select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: "desc" } }
          }
        },
        scripts: { orderBy: { version: "desc" } },
        runs: { orderBy: { createdAt: "desc" }, take: 50 }
      }
    });
    if (!tc) return reply.code(404).send({ error: "\u7528\u4F8B\u4E0D\u5B58\u5728" });
    return tc;
  });
  app2.put("/api/test-cases/:id", async (req, reply) => {
    const { id } = req.params;
    const body = req.body ?? {};
    const { title, description, naturalLanguage, status, defaultScriptId } = body;
    let defaultScript = void 0;
    if ("defaultScriptId" in body) {
      const sid = defaultScriptId ?? null;
      if (sid) {
        const owned = await prisma.testScript.findFirst({ where: { id: sid, testCaseId: id }, select: { id: true } });
        if (!owned) return reply.code(400).send({ error: "\u811A\u672C\u4E0D\u5C5E\u4E8E\u8BE5\u7528\u4F8B" });
      }
      defaultScript = sid;
    }
    return prisma.testCase.update({
      where: { id },
      data: { title, description, naturalLanguage, status, defaultScriptId: defaultScript }
    });
  });
  app2.delete("/api/test-cases/:id", async (req) => {
    const { id } = req.params;
    const runs = await prisma.testRun.findMany({ where: { testCaseId: id }, select: { id: true } });
    await cleanupScreenshots(runs.map((r) => r.id));
    await prisma.testCase.delete({ where: { id } });
    return { ok: true };
  });
  app2.put("/api/projects/:projectId/test-cases/order", async (req, reply) => {
    const { projectId } = req.params;
    const body = req.body ?? {};
    const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === "string" && v.length > 0) : [];
    if (!ids.length) return reply.code(400).send({ error: "\u7F3A\u5C11 ids" });
    const owned = new Set(
      (await prisma.testCase.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id)
    );
    if (ids.some((id) => !owned.has(id))) return reply.code(400).send({ error: "\u5305\u542B\u4E0D\u5C5E\u4E8E\u8BE5\u9879\u76EE\u7684\u7528\u4F8B" });
    await prisma.$transaction(
      ids.map((id, index) => prisma.testCase.update({ where: { id }, data: { sortOrder: index } }))
    );
    return { ok: true };
  });
  app2.delete("/api/test-cases", async (req, reply) => {
    const body = req.body ?? {};
    const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === "string" && v.length > 0) : [];
    if (!ids.length) return reply.code(400).send({ error: "\u7F3A\u5C11 ids" });
    const runs = await prisma.testRun.findMany({ where: { testCaseId: { in: ids } }, select: { id: true } });
    await cleanupScreenshots(runs.map((r) => r.id));
    const { count } = await prisma.testCase.deleteMany({ where: { id: { in: ids } } });
    return { ok: true, count };
  });
}

// src/routes/scripts.ts
async function scriptRoutes(app2) {
  app2.get(
    "/api/test-cases/:testCaseId/scripts",
    async (req) => prisma.testScript.findMany({
      where: { testCaseId: req.params.testCaseId },
      orderBy: { version: "desc" }
    })
  );
  app2.get("/api/scripts/:id", async (req, reply) => {
    const script = await prisma.testScript.findUnique({
      where: { id: req.params.id }
    });
    if (!script) return reply.code(404).send({ error: "\u811A\u672C\u4E0D\u5B58\u5728" });
    return script;
  });
  app2.post("/api/test-cases/:testCaseId/scripts", async (req, reply) => {
    const testCaseId = req.params.testCaseId;
    const { steps, rawCode } = req.body ?? {};
    if (!Array.isArray(steps)) return reply.code(400).send({ error: "\u7F3A\u5C11 steps" });
    const last = await prisma.testScript.findFirst({
      where: { testCaseId },
      orderBy: { version: "desc" }
    });
    const version = (last?.version ?? 0) + 1;
    return prisma.testScript.create({
      data: { testCaseId, version, steps, rawCode }
    });
  });
  app2.put("/api/scripts/:id", async (req, reply) => {
    const { id } = req.params;
    const { steps, rawCode } = req.body ?? {};
    const existing = await prisma.testScript.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "\u811A\u672C\u4E0D\u5B58\u5728" });
    return prisma.testScript.update({ where: { id }, data: { steps, rawCode } });
  });
  app2.delete("/api/scripts/:id", async (req) => {
    const { id } = req.params;
    await prisma.testScript.delete({ where: { id } });
    return { ok: true };
  });
}

// src/routes/settings.ts
function mask(key) {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
function settingsBody(c) {
  return {
    openaiApiKey: mask(c.openaiApiKey),
    openaiApiKeySet: Boolean(c.openaiApiKey),
    openaiBaseUrl: c.openaiBaseUrl,
    openaiModel: c.openaiModel,
    openaiModelVision: c.openaiModelVision,
    maxSteps: c.maxSteps,
    browserPath: c.browserPath,
    splitSystemPrompt: c.splitSystemPrompt,
    reasoningEffort: c.reasoningEffort,
    defaultSplitSystemPrompt: DEFAULT_SPLIT_SYSTEM_PROMPT,
    detectedBrowserPath: detectSystemChrome() ?? "",
    systemBrowserMode: isSystemBrowserMode(),
    configured: isConfigured(),
    generationLogRetentionDays: c.generationLogRetentionDays
  };
}
async function settingsRoutes(app2) {
  app2.get("/api/settings", async () => settingsBody(getConfig()));
  app2.post("/api/settings", async (req) => {
    const body = req.body ?? {};
    const partial = {};
    if (body.openaiApiKey && !body.openaiApiKey.includes("****")) {
      partial.openaiApiKey = body.openaiApiKey;
    }
    if (typeof body.openaiBaseUrl === "string") partial.openaiBaseUrl = body.openaiBaseUrl;
    if (typeof body.openaiModel === "string") partial.openaiModel = body.openaiModel;
    if (typeof body.openaiModelVision === "boolean") partial.openaiModelVision = body.openaiModelVision;
    if (typeof body.maxSteps === "number") partial.maxSteps = body.maxSteps;
    if (typeof body.browserPath === "string") partial.browserPath = body.browserPath.trim();
    if (typeof body.splitSystemPrompt === "string" && body.splitSystemPrompt.trim()) {
      partial.splitSystemPrompt = body.splitSystemPrompt;
    }
    if (typeof body.reasoningEffort === "string" && REASONING_EFFORTS.includes(body.reasoningEffort)) {
      partial.reasoningEffort = body.reasoningEffort;
    }
    if (body.generationLogRetentionDays === null) partial.generationLogRetentionDays = null;
    else if (typeof body.generationLogRetentionDays === "number" && body.generationLogRetentionDays > 0) {
      partial.generationLogRetentionDays = Math.floor(body.generationLogRetentionDays);
    }
    return settingsBody(saveConfig(partial));
  });
}

// src/routes/generate.ts
import { randomUUID as randomUUID3 } from "crypto";

// src/services/generationLogService.ts
var STEP_TYPE = {
  USER_INPUT: "user_input",
  // 用户提交自然语言
  PLAN: "plan",
  // preSplit LLM 调用（含 system/user/assistant）
  AIFIX: "aifix",
  // aiFix LLM 调用
  VISION: "vision",
  // 视觉模型调用
  TOOL: "tool",
  // act/observe/手动捕获/pubTool 等工具轨迹
  STATUS: "status",
  // 普通状态消息
  PLAN_CONFIRMED: "plan_confirmed",
  // 用户确认步骤计划
  REVOKE: "revoke",
  // 撤销步骤范围并重拆
  REVISE: "revise",
  // 模型修订已落库脚本步骤（revise 工具：改参数/删冗余步骤）
  ASSIST: "assist",
  // 定位失败用户决策（重新描述/AI 修正/手动/跳过/撤销）
  DONE: "done",
  // 生成完成（含最终脚本）
  ERROR: "error"
  // 生成失败
};
var MAX_RESULT_CHARS = 16e3;
function trunc(s, n = MAX_RESULT_CHARS) {
  if (s == null) return s;
  return s.length > n ? s.slice(0, n) + `
\u2026(\u5DF2\u622A\u65AD, \u539F\u59CB ${s.length} \u5B57)` : s;
}
function swallow(p) {
  p.catch((e) => console.warn("[genLog] \u5199\u5165\u5931\u8D25:", e));
}
async function upsertLog(jobId, patch) {
  try {
    const log = await prisma.generationLog.upsert({
      where: { jobId },
      create: {
        jobId,
        projectId: patch.projectId ?? null,
        testCaseId: patch.testCaseId ?? null,
        nl: patch.nl ?? "",
        startUrl: patch.startUrl ?? null,
        status: patch.status ?? "RUNNING"
      },
      update: {
        // 续接（continueGenerate）时允许更新这些元数据
        ...patch.projectId !== void 0 ? { projectId: patch.projectId } : {},
        ...patch.testCaseId !== void 0 ? { testCaseId: patch.testCaseId } : {},
        ...patch.startUrl !== void 0 ? { startUrl: patch.startUrl } : {},
        ...patch.nl ? { nl: patch.nl } : {},
        ...patch.status ? { status: patch.status } : {}
      }
    });
    return log.id;
  } catch (e) {
    console.warn("[genLog] upsertLog \u5931\u8D25:", e);
    return null;
  }
}
function appendStep(logId, step) {
  if (!logId) return;
  swallow(
    prisma.generationStep.create({
      data: {
        logId,
        type: step.type,
        stepIndex: step.stepIndex ?? null,
        message: step.message ?? null,
        system: step.system ?? null,
        user: trunc(step.user) ?? null,
        assistant: trunc(step.assistant) ?? null,
        tool: step.tool ?? null,
        args: step.args ?? null,
        result: trunc(step.result) ?? null,
        error: step.error ?? null,
        usage: step.usage ?? null
      }
    }).then(() => void 0)
  );
}
function updateStepAssistant(logId, stepIndex, assistant) {
  if (!logId || !Number.isInteger(stepIndex)) return;
  swallow(
    prisma.generationStep.updateMany({
      where: { logId, stepIndex, type: STEP_TYPE.TOOL },
      data: { assistant: trunc(assistant) }
    }).then(() => void 0)
  );
}
function markFinished(jobId, status, extra) {
  swallow(
    prisma.generationLog.update({
      where: { jobId },
      data: {
        status,
        finishedAt: /* @__PURE__ */ new Date(),
        ...extra?.error ? { error: extra.error } : {},
        ...extra?.scriptSteps ? { scriptSteps: extra.scriptSteps } : {},
        ...extra?.totalUsage ? { totalUsage: extra.totalUsage } : {}
      }
    }).then(() => void 0)
  );
}
function markStatus(jobId, status) {
  swallow(
    prisma.generationLog.update({
      where: { jobId },
      data: { status, finishedAt: status === "RUNNING" ? null : void 0 }
    }).then(() => void 0)
  );
}
async function listLogs(opts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = {};
  if (opts.status && opts.status !== "ALL") where.status = opts.status;
  if (opts.keyword) {
    where.OR = [
      { nl: { contains: opts.keyword } },
      { testCase: { is: { title: { contains: opts.keyword } } } }
    ];
  }
  const [items, total] = await Promise.all([
    prisma.generationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        testCase: { select: { id: true, title: true } },
        _count: { select: { steps: true } }
      }
    }),
    prisma.generationLog.count({ where })
  ]);
  return { items, total };
}
async function getLogById(id) {
  const log = await prisma.generationLog.findUnique({
    where: { id },
    include: {
      testCase: { select: { id: true, title: true } },
      steps: { orderBy: { createdAt: "asc" } }
    }
  });
  return log;
}
async function reconcileTotalUsage(logId) {
  try {
    const rows = await prisma.generationStep.findMany({
      where: { logId, type: { notIn: [STEP_TYPE.DONE, STEP_TYPE.ERROR] } },
      select: { usage: true }
    });
    let sumTotal = 0;
    let sumCached = 0;
    let sumInput = 0;
    let sumOutput = 0;
    for (const r of rows) {
      const u = r.usage;
      if (!u) continue;
      sumTotal += Number(u.totalTokens ?? 0);
      sumCached += Number(u.cachedTokens ?? 0);
      sumInput += Number(u.inputTokens ?? 0);
      sumOutput += Number(u.outputTokens ?? 0);
    }
    const log = await prisma.generationLog.findUnique({ where: { id: logId }, select: { totalUsage: true } });
    const runtime3 = log?.totalUsage ?? {};
    const runtimeTotal = Number(runtime3.totalTokens ?? 0);
    const runtimeCached = Number(runtime3.cachedTokens ?? 0);
    const runtimeInput = Number(runtime3.inputTokens ?? 0);
    const runtimeOutput = Number(runtime3.outputTokens ?? 0);
    const finalTotal = Math.max(sumTotal, runtimeTotal);
    const finalCached = Math.max(sumCached, runtimeCached);
    const finalInput = Math.max(sumInput, runtimeInput);
    const finalOutput = Math.max(sumOutput, runtimeOutput);
    if (sumTotal > runtimeTotal * 1.05 && runtimeTotal > 0) {
      console.warn(`[usage] \u8BB0\u8D26\u7591\u4F3C\u4E22\u5931\uFF1A\u8FD0\u884C\u65F6\u7D2F\u8BA1 ${runtimeTotal} < \u6B65\u9AA4\u660E\u7EC6\u548C ${sumTotal}\uFF08\u5DEE ${sumTotal - runtimeTotal}\uFF09\uFF0C\u5934\u90E8\u4EE5\u660E\u7EC6\u548C\u4E3A\u51C6`);
    }
    await prisma.generationLog.update({
      where: { id: logId },
      data: { totalUsage: { inputTokens: finalInput, outputTokens: finalOutput, totalTokens: finalTotal, cachedTokens: finalCached } }
    });
  } catch (e) {
    console.warn("[usage] \u5BF9\u8D26\u5931\u8D25\uFF08\u4FDD\u7559\u539F\u503C\uFF09:", e);
  }
}
async function deleteLog(id) {
  await prisma.generationLog.delete({ where: { id } });
}
async function deleteLogs(ids) {
  if (!ids.length) {
    const r2 = await prisma.generationLog.deleteMany();
    return r2.count;
  }
  const r = await prisma.generationLog.deleteMany({ where: { id: { in: ids } } });
  return r.count;
}
async function pruneExpired(days) {
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
  const r = await prisma.generationLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (r.count > 0) console.log(`[genLog] \u5DF2\u6E05\u7406 ${r.count} \u6761\u8D85\u8FC7 ${days} \u5929\u7684\u751F\u6210\u8BB0\u5F55`);
  return r.count;
}

// src/services/generation/util.ts
function normalizeStepSystemVars(step) {
  const norm = (t) => legacyToUnifiedSystemVars(t);
  step.instruction = norm(step.instruction);
  step.url = norm(step.url);
  step.value = norm(step.value);
  if (step.locator) {
    step.locator.value = norm(step.locator.value) ?? step.locator.value;
    if (step.locator.name != null) step.locator.name = norm(step.locator.name) ?? step.locator.name;
    if (step.locator.scope) {
      step.locator.scope.value = norm(step.locator.scope.value) ?? step.locator.scope.value;
      if (step.locator.scope.name != null) step.locator.scope.name = norm(step.locator.scope.name) ?? step.locator.scope.name;
    }
  }
  if (step.assertion) {
    step.assertion.expected = norm(step.assertion.expected);
    step.assertion.jsonPath = norm(step.assertion.jsonPath);
  }
  return step;
}
function buildAttachmentParts(atts) {
  const textParts = [];
  const images = [];
  for (const a of atts) {
    if (a.isImage) {
      if (a.imageB64) {
        images.push({ name: a.name, imageB64: a.imageB64, imageMime: a.imageMime ?? a.mime });
      } else if (a.content) {
        textParts.push(`

[\u9644\u4EF6 ${a.name}]
${a.content}`);
      } else {
        textParts.push(`

[\u9644\u4EF6 ${a.name}]\uFF08\u56FE\u7247\u9644\u4EF6\uFF0C\u672A\u80FD\u63D0\u53D6\u5185\u5BB9\uFF09`);
      }
    } else {
      textParts.push(`

[\u9644\u4EF6 ${a.name}]
${a.content}`);
    }
  }
  return { text: textParts.join(""), images };
}
function trunc2(t, n) {
  return t.length > n ? t.slice(0, n) + "\u2026" : t;
}
function stripFences(s) {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function safeJsonParse2(s) {
  try {
    return JSON.parse(s);
  } catch {
    return void 0;
  }
}

// src/services/generation/logBridge.ts
var activeLogIds = /* @__PURE__ */ new Map();
function pub(msg) {
  publish(msg);
  const logId = msg.jobId ? activeLogIds.get(msg.jobId) : null;
  if (logId) logFromWsEvent(msg, logId);
}
function logFromWsEvent(msg, logId) {
  switch (msg.type) {
    case "gen:status":
      appendStep(logId, { type: STEP_TYPE.STATUS, message: String(msg.message ?? "") });
      return;
    case "gen:tool": {
      const s = msg.step ?? {};
      appendStep(logId, {
        type: STEP_TYPE.TOOL,
        stepIndex: typeof msg.index === "number" ? msg.index : null,
        tool: String(s.actionLabel ?? ""),
        message: String(s.actionDetail ?? ""),
        result: String(s.result ?? ""),
        args: msg.args ?? null,
        usage: msg.usage ?? null
      });
      return;
    }
    case "gen:plan":
      appendStep(logId, {
        type: STEP_TYPE.STATUS,
        message: `\u9884\u62C6\u5206\u5B8C\u6210\uFF0C\u8BF7\u786E\u8BA4\u6B65\u9AA4\u8BA1\u5212\uFF08${Array.isArray(msg.steps) ? msg.steps.length : 0} \u6B65\uFF09`
      });
      return;
    case "gen:revoke":
      appendStep(logId, {
        type: STEP_TYPE.REVOKE,
        message: `\u5DF2\u64A4\u9500\u7B2C ${msg.from}~${msg.to} \u6B65`,
        args: { from: msg.from, to: msg.to, nl: msg.nl }
      });
      return;
    case "gen:revise":
      appendStep(logId, {
        type: STEP_TYPE.REVISE,
        message: `\u6A21\u578B\u4FEE\u8BA2\u811A\u672C\u6B65\u9AA4\uFF08${Array.isArray(msg.ops) ? msg.ops.length : 0} \u9879\u64CD\u4F5C\uFF09`,
        args: { ops: msg.ops, base: msg.base }
      });
      return;
    case "gen:assist":
      appendStep(logId, {
        type: STEP_TYPE.ASSIST,
        stepIndex: typeof msg.stepIndex === "number" ? msg.stepIndex : null,
        message: String(msg.instruction ?? ""),
        args: { kind: msg.kind, canManual: msg.canManual }
      });
      return;
    case "gen:assist-status":
      appendStep(logId, { type: STEP_TYPE.STATUS, message: String(msg.message ?? "") });
      return;
    case "gen:paused":
      appendStep(logId, { type: STEP_TYPE.STATUS, message: "\u5DF2\u6682\u505C\uFF0C\u53EF\u7EE7\u7EED\u751F\u6210" });
      if (msg.jobId) markStatus(msg.jobId, "PAUSED");
      return;
    case "gen:done": {
      const stepCount = msg.script?.steps?.length ?? 0;
      const usage = msg.usage ?? null;
      appendStep(logId, {
        type: STEP_TYPE.DONE,
        message: `\u751F\u6210\u5B8C\u6210\uFF0C\u5171 ${stepCount} \u6B65`,
        args: { stepCount }
      });
      if (msg.jobId) {
        markFinished(msg.jobId, "DONE", {
          scriptSteps: msg.script?.steps,
          totalUsage: usage ?? void 0
        });
        activeLogIds.delete(msg.jobId);
      }
      return;
    }
    case "gen:error": {
      const message = String(msg.message ?? "");
      const isCancel = message.includes("\u53D6\u6D88");
      const status = isCancel ? "CANCELLED" : "ERROR";
      const usage = msg.usage ?? null;
      appendStep(logId, { type: STEP_TYPE.ERROR, error: message });
      if (msg.jobId) {
        markFinished(msg.jobId, status, {
          error: message,
          totalUsage: usage ?? void 0
        });
        activeLogIds.delete(msg.jobId);
      }
      return;
    }
  }
}
function pubToolWithUsage(jobId, index, actionLabel2, actionDetail, result, usage, args) {
  pub({
    type: "gen:tool",
    jobId,
    index,
    step: { actionLabel: actionLabel2, actionDetail, result: trunc2(result, 300) },
    usage,
    args
  });
}
function updateToolAssistant(jobId, stepIndex, assistant) {
  updateStepAssistant(activeLogIds.get(jobId), stepIndex, assistant);
}

// src/services/generation/jobControl.ts
var PLAN_TIMEOUT_MS = 5 * 6e4;
var ASSIST_TIMEOUT_MS = 5 * 6e4;
var waits = /* @__PURE__ */ new Map();
var waitTimers = /* @__PURE__ */ new Map();
var revokeHandlers = /* @__PURE__ */ new Map();
var pauseHandlers = /* @__PURE__ */ new Map();
var pauseTimers = /* @__PURE__ */ new Map();
function setWait(jobId, wait, timeoutMs) {
  waits.set(jobId, wait);
  const t = setTimeout(() => resolveWait(jobId, null), timeoutMs);
  t.unref?.();
  waitTimers.set(jobId, t);
}
function resolveWait(jobId, value) {
  const w = waits.get(jobId);
  if (!w) return;
  waits.delete(jobId);
  const t = waitTimers.get(jobId);
  if (t) clearTimeout(t);
  waitTimers.delete(jobId);
  w.resolve(value);
}
function pauseJob(jobId) {
  const h = pauseHandlers.get(jobId);
  if (!h) return false;
  h();
  return true;
}
function scheduleSessionGc(jobId) {
  const t = setTimeout(
    () => {
      pauseTimers.delete(jobId);
      pauseHandlers.delete(jobId);
      closeSession(jobId).catch(() => {
      });
    },
    30 * 6e4
  );
  t.unref?.();
  pauseTimers.set(jobId, t);
}
function cancelSessionGc(jobId) {
  const gc = pauseTimers.get(jobId);
  if (gc) {
    clearTimeout(gc);
    pauseTimers.delete(jobId);
  }
}
function confirmPlan(jobId, steps) {
  const w = waits.get(jobId);
  if (!w || w.type !== "plan") return false;
  resolveWait(jobId, steps);
  return true;
}
function assistStep(jobId, decision) {
  const w = waits.get(jobId);
  if (!w || w.type !== "assist") return false;
  if (decision.decision === "revoke") {
    const handler = revokeHandlers.get(jobId);
    if (!handler) return "\u5F53\u524D\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u751F\u6210\u6D41\u7A0B";
    const err = handler(decision.from, decision.to);
    if (err) return err;
    pub({ type: "gen:revoke", jobId, from: decision.from, to: decision.to, nl: decision.nl });
  }
  resolveWait(jobId, decision);
  return true;
}
function askUser(jobId, o) {
  pub({ type: "gen:assist", jobId, stepIndex: o.stepIndex, kind: o.kind, instruction: o.instruction, canManual: o.canManual });
  return new Promise((resolve) => setWait(jobId, { type: "assist", resolve }, ASSIST_TIMEOUT_MS));
}
async function awaitPlanConfirm(jobId, plan, usage) {
  pub({ type: "gen:plan", jobId, steps: plan, usage });
  return new Promise((resolve) => {
    setWait(jobId, { type: "plan", resolve }, PLAN_TIMEOUT_MS);
  });
}
function createJobRuntime(jobId) {
  let cancelled = false;
  let paused = false;
  const abortCtrl = new AbortController();
  const cancel = (message) => {
    cancelled = true;
    abortCtrl.abort();
    resolveWait(jobId, null);
    closeSession(jobId);
    pub({ type: "gen:error", jobId, message });
  };
  registerCancel(jobId, () => cancel("\u5DF2\u53D6\u6D88"));
  const pause = () => {
    paused = true;
    cancelled = true;
    abortCtrl.abort();
    resolveWait(jobId, null);
    pub({ type: "gen:paused", jobId, message: "\u5DF2\u6682\u505C\uFF0C\u53EF\u8C03\u6574\u6B65\u9AA4\u540E\u7EE7\u7EED\u751F\u6210" });
  };
  pauseHandlers.set(jobId, pause);
  return { abortCtrl, isCancelled: () => cancelled, isPaused: () => paused, cancel, pause };
}
function releaseJob(jobId, paused) {
  if (!paused) {
    pauseHandlers.delete(jobId);
    resolveWait(jobId, null);
    unregisterCancel(jobId);
    clearUsage(jobId);
  }
}

// src/services/generation/sessionSetup.ts
import { chromium as chromium4 } from "playwright-core";

// src/services/attachmentService.ts
import { randomUUID as randomUUID2 } from "crypto";
import fs4 from "fs";
import path6 from "path";
import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import * as XLSX from "xlsx";
var MAX_FILE_SIZE = 20 * 1024 * 1024;
var MAX_CONTENT_CHARS = 1e5;
var TTL_MS = 60 * 60 * 1e3;
var IMAGE_MIMES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml"]);
var IMAGE_EXTS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml"
};
var store2 = /* @__PURE__ */ new Map();
var STORE_DIR = path6.join(path6.dirname(getScreenshotDir()), "attachments");
function persist(a) {
  try {
    fs4.writeFileSync(path6.join(STORE_DIR, `${a.id}.json`), JSON.stringify(a), "utf-8");
  } catch {
  }
}
function unpersist(id) {
  try {
    fs4.rmSync(path6.join(STORE_DIR, `${id}.json`), { force: true });
  } catch {
  }
}
function loadPersisted() {
  let entries = [];
  try {
    entries = fs4.readdirSync(STORE_DIR);
  } catch {
    return;
  }
  for (const f of entries) {
    if (!f.endsWith(".json")) continue;
    try {
      const a = JSON.parse(fs4.readFileSync(path6.join(STORE_DIR, f), "utf-8"));
      if (a?.id && typeof a.content === "string") store2.set(a.id, a);
    } catch {
    }
  }
}
fs4.mkdirSync(STORE_DIR, { recursive: true });
loadPersisted();
function getAttachment(id) {
  const a = store2.get(id);
  if (!a) return void 0;
  if (Date.now() - a.createdAt > TTL_MS) {
    store2.delete(id);
    unpersist(id);
    return void 0;
  }
  return a;
}
function deleteAttachment(id) {
  store2.delete(id);
  unpersist(id);
}
function sweep() {
  const now = Date.now();
  for (const [id, a] of store2) {
    if (now - a.createdAt > TTL_MS) {
      store2.delete(id);
      unpersist(id);
    }
  }
}
function imageMimeOf(mime, ext) {
  return MIME_BY_EXT[ext] ?? (mime.startsWith("image/") ? mime : "image/png");
}
async function storeAttachment(file) {
  sweep();
  if (file.size > MAX_FILE_SIZE) throw new Error("\u6587\u4EF6\u8FC7\u5927\uFF08\u5355\u6587\u4EF6\u4E0A\u9650 20MB\uFF09");
  const ext = path6.extname(file.name).toLowerCase();
  const isImage = IMAGE_MIMES.has(file.mime) || IMAGE_EXTS.has(ext);
  const content = isImage ? "" : await loadText(file, ext);
  let imageB64;
  let imageMime;
  if (isImage) {
    imageMime = imageMimeOf(file.mime, ext);
    imageB64 = file.buffer.toString("base64");
  }
  const att = {
    id: randomUUID2(),
    name: file.name,
    mime: file.mime,
    size: file.size,
    isImage,
    content: content.slice(0, MAX_CONTENT_CHARS),
    imageB64,
    imageMime,
    createdAt: Date.now()
  };
  store2.set(att.id, att);
  persist(att);
  return att;
}
async function loadText(file, ext) {
  switch (ext) {
    case ".xlsx":
    case ".xls":
      return loadExcel(file.buffer);
    case ".pdf":
      return loadPdf(file.buffer);
    case ".docx":
      return loadDocx(file.buffer);
    case ".csv":
      return loadCsv(file.buffer);
    case ".json":
      return loadJson(file.buffer);
    default:
      return file.buffer.toString("utf-8");
  }
}
async function loadPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}
async function loadDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}
function loadCsv(buffer) {
  const records = parseCsv(buffer, {
    columns: true,
    bom: true,
    relax_column_count: true
  });
  const blocks = records.map(
    (row) => Object.entries(row).filter(([, v]) => v !== "" && v !== null && v !== void 0).map(([k, v]) => `${k}: ${v}`).join("\n")
  );
  const text = blocks.join("\n\n");
  if (!text.trim()) throw new Error("\u672A\u80FD\u4ECE CSV \u4E2D\u8BFB\u53D6\u5230\u5185\u5BB9");
  return text;
}
function loadJson(buffer) {
  const data = JSON.parse(buffer.toString("utf-8"));
  const lines = [];
  const walk = (node, prefix) => {
    if (node === null || node === void 0) return;
    if (typeof node === "string") {
      lines.push(prefix ? `${prefix}: ${node}` : node);
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
    } else if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
    } else {
      lines.push(prefix ? `${prefix}: ${String(node)}` : String(node));
    }
  };
  walk(data, "");
  const text = lines.join("\n");
  if (!text.trim()) throw new Error("\u672A\u80FD\u4ECE JSON \u4E2D\u8BFB\u53D6\u5230\u5185\u5BB9");
  return text;
}
function loadExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts = wb.SheetNames.map((name) => `\u3010\u5DE5\u4F5C\u8868 ${name}\u3011
${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`);
  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("\u672A\u80FD\u4ECE Excel \u4E2D\u8BFB\u53D6\u5230\u5185\u5BB9");
  return text;
}

// src/services/generation/sessionSetup.ts
function buildEnvVarHint(envMap) {
  const envVarKeys = Object.keys(envMap);
  return envVarKeys.length ? `\u672C\u9879\u76EE\u53EF\u7528\u73AF\u5883\u53D8\u91CF\uFF1A${envVarKeys.map((k) => `{{${k}}}`).join("\u3001")}\u3002\u6B65\u9AA4\u4E2D\u6D89\u53CA\u8FD9\u4E9B\u503C\u65F6\u7528\u5BF9\u5E94\u5360\u4F4D\u7B26\u5F15\u7528\uFF0C\u4E0D\u8981\u5199\u6B7B\u771F\u5B9E\u503C\u3002` : "";
}
function loadGenAttachments(jobId, ids) {
  if (!ids.length) return { text: "", images: [] };
  const atts = ids.map((id) => getAttachment(id)).filter((a) => Boolean(a));
  const missing = ids.filter((id) => !atts.some((a) => a.id === id));
  if (missing.length > 0) {
    pub({ type: "gen:error", jobId, message: `${missing.length} \u4E2A\u9644\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6DFB\u52A0\u540E\u91CD\u8BD5`, missingAttachments: missing });
    return null;
  }
  const { text, images } = buildAttachmentParts(atts);
  const visionNote = images.length ? `\uFF1B\u5176\u4E2D ${images.length} \u5F20\u56FE\u7247\u5DF2\u4EE5\u591A\u6A21\u6001\u76F4\u63A5\u53D1\u7ED9\u4E3B\u6A21\u578B` : "";
  pub({ type: "gen:status", jobId, message: `[\u9644\u4EF6] \u5DF2\u52A0\u8F7D ${atts.length} \u4E2A\u6587\u4EF6\uFF1A${atts.map((a) => a.name).join("\u3001")}${visionNote}` });
  return { text, images };
}
function createSubstituter(envMap, now) {
  const sysVars = {};
  const sub2 = (t) => {
    const missing = collectSystemKeys(t ? [t] : []).filter((k) => !(k in sysVars));
    if (missing.length) Object.assign(sysVars, resolveSystemKeys(missing, now));
    return substituteAll(t, envMap, sysVars);
  };
  return { sub: sub2 };
}
function createStepEmitter(jobId, steps, offsetOf) {
  return async (step) => {
    normalizeStepSystemVars(step);
    steps.push(step);
    pub({ type: "gen:step", jobId, index: offsetOf() + steps.length - 1, step });
  };
}
async function setupGenPage(jobId, page, projectId) {
  let pluginScripts = [];
  try {
    pluginScripts = await enabledInpageScripts(projectId ?? null);
    if (pluginScripts.length) await page.addInitScript(buildPluginInitScript(pluginScripts));
  } catch {
  }
  try {
    await page.addInitScript(CANDIDATE_SCRIPT);
  } catch {
  }
  const pw = await connectPwView(jobId, page);
  if (!pw.pwPage) {
    if (pw.pwBrowser) {
      try {
        await pw.pwBrowser.close();
      } catch {
      }
    }
    return { pwBrowser: null, pwPage: null, error: `\u6D4F\u89C8\u5668\u7CBE\u786E\u9A8C\u8BC1\u901A\u9053\uFF08CDP\uFF09\u8FDE\u63A5\u5931\u8D25\uFF1A${pw.error ?? "\u672A\u77E5\u539F\u56E0"}\u3002\u5DF2\u7EC8\u6B62\u672C\u6B21\u751F\u6210\uFF0C\u8BF7\u91CD\u8BD5` };
  }
  if (pluginScripts.length) {
    try {
      await installPluginPwBridge(pw.pwPage);
    } catch (e) {
      console.warn("[plugin] Playwright \u6865\u6CE8\u5165\u5931\u8D25\uFF08\u63D2\u4EF6\u5185 pw \u5C06\u4E0D\u53EF\u7528\uFF09\uFF1A", e);
    }
  }
  return { pwBrowser: pw.pwBrowser, pwPage: pw.pwPage };
}
async function finalizeGenJob(jobId, o) {
  if (o.pwBrowser) {
    try {
      await o.pwBrowser.close();
    } catch {
    }
  }
  if (o.paused) scheduleSessionGc(jobId);
  else await closeSession(jobId);
  if (o.logId) await reconcileTotalUsage(o.logId);
}
async function connectPwView(jobId, page) {
  const cdpPort = getCdpPort(jobId);
  if (!cdpPort) return { pwBrowser: null, pwPage: null, error: `\u672A\u627E\u5230\u4F1A\u8BDD CDP \u7AEF\u53E3\uFF08jobId=${jobId}\uFF09` };
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const pwBrowser = await chromium4.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
      const ctx = pwBrowser.contexts()[0];
      const pages = await ctx.pages();
      let pageUrl = "";
      try {
        pageUrl = String(await page.url() ?? "");
      } catch {
      }
      const url = pageUrl.split("#")[0];
      const pwPage = url && pages.find((p) => (p.url?.() ?? "").split("#")[0] === url) || pages[0] || null;
      if (!pwPage) {
        return { pwBrowser, pwPage: null, error: `CDP \u5DF2\u8FDE\u63A5\u4F46\u672A\u627E\u5230\u9875\u9762\uFF08\u5171 ${pages.length} \u4E2A\uFF0Curl=${url || "(\u7A7A)"}\uFF09` };
      }
      return { pwBrowser, pwPage };
    } catch (e) {
      lastErr = String(e);
      if (attempt < 4) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return { pwBrowser: null, pwPage: null, error: lastErr ?? "\u8FDE\u63A5\u5931\u8D25" };
}
async function loadLoginStorageState(loginConfigId) {
  const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true, name: true } });
  if (!cfg) return { storageState: null, name: `${loginConfigId} \u4E0D\u5B58\u5728`, ok: false };
  const ss = typeof cfg.storageState === "string" ? safeJsonParse2(cfg.storageState) : cfg.storageState;
  if (!ss) return { storageState: null, name: `\u300C${cfg.name}\u300D\u72B6\u6001\u4E3A\u7A7A`, ok: false };
  return { storageState: ss, name: cfg.name, ok: true };
}
async function loadProjectViewport(projectId) {
  if (!projectId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { viewport: true } });
  return readViewport(p?.viewport);
}

// src/services/toolLoop.ts
var RESULT_MAX_CHARS = 400;
var CONTEXT_WATERMARK_TOKENS = 6e4;
var KEEP_RECENT_ROUNDS = 3;
var TRIM_KEEP_CHARS = 80;
var STUCK_WINDOW = 8;
var STUCK_WARN_AT = 4;
var STUCK_ASSIST_AT = 6;
var STUCK_ABORT_AT = 9;
var STUCK_MUTATING = /* @__PURE__ */ new Set(["goto", "click", "fill", "press", "check", "select", "component_action", "act"]);
var SEE_ASSIST_AT = 4;
var LINK_FLIP_TRANSITIONS = 4;
var LINK_WINDOW = 12;
function stuckSig(name, args) {
  if (!STUCK_MUTATING.has(name)) return null;
  const sel = String(args.selector ?? "").trim();
  if (name === "goto") return `goto ${String(args.url ?? "")}`;
  if (name === "act") return `act ${String(args.instruction ?? "").trim()}`;
  if (name === "component_action") return `component_action ${sel} ${String(args.action ?? "")} ${String(args.value ?? "")}`;
  if (name === "fill" || name === "select") return `${name} ${sel} ${String(args.value ?? "")}`;
  return `${name} ${sel}${args.key != null ? ` ${String(args.key)}` : ""}`;
}
function isSelectLike(name, args) {
  return name === "select" || name === "component_action" && String(args.action ?? "") === "select";
}
function linkFlipPair(hist) {
  if (hist.length < LINK_FLIP_TRANSITIONS + 1) return null;
  const counts = /* @__PURE__ */ new Map();
  for (let i = 1; i < hist.length; i++) {
    const p = hist[i - 1];
    const q = hist[i];
    if (p === q) continue;
    const key = p < q ? `${p}|${q}` : `${q}|${p}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = null;
  for (const [key, n] of counts) if (!best || n > best.n) best = { key, n };
  if (!best || best.n < LINK_FLIP_TRANSITIONS) return null;
  const [a, b] = best.key.split("|");
  return { a, b, transitions: best.n };
}
function usageDelta(before, after) {
  return {
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    totalTokens: after.totalTokens - before.totalTokens,
    cachedTokens: after.cachedTokens - before.cachedTokens
  };
}
var stuckWarnText = (count) => `
\u26A0\uFE0F \u7CFB\u7EDF\u63D0\u793A\uFF1A\u540C\u4E00\u64CD\u4F5C\u8FD1\u671F\u5DF2\u91CD\u590D\u6267\u884C ${count} \u6B21\u4E14\u65E0\u8FDB\u5C55\u3002\u4E0D\u8981\u518D\u6B21\u91CD\u590D\uFF1A\u8BF7\u5148 snapshot \u786E\u8BA4\u5F53\u524D\u72B6\u6001\uFF0C\u6362\u4E00\u79CD\u65B9\u5F0F\uFF08\u5176\u4ED6\u5B9A\u4F4D/\u7EC4\u4EF6\u52A8\u4F5C/act\uFF09\u5B8C\u6210\u76EE\u6807\uFF1B\u82E5\u786E\u8BA4\u76EE\u6807\u65E0\u6CD5\u8FBE\u6210\uFF0C\u8BF7\u8C03\u7528 finish(success=false) \u7ED3\u675F\u3002`;
var observeWarnText = (count) => `
\u26A0\uFE0F \u7CFB\u7EDF\u63D0\u793A\uFF1A\u5DF2\u8FDE\u7EED ${count} \u6B21\u89C6\u89C9\u89C2\u5BDF\u4ECD\u65E0\u8FDB\u5C55\u3002\u4E0D\u8981\u7EE7\u7EED\u76F2\u76EE\u622A\u56FE\uFF1A\u8BF7\u8C03\u7528 ask_human \u5411\u7528\u6237\u6C42\u52A9\uFF08\u7B80\u8FF0\u56F0\u60D1\u70B9\u4E0E\u5DF2\u5C1D\u8BD5\u7684\u505A\u6CD5\uFF09\uFF0C\u6216\u6362\u4E00\u6761\u8DEF\u5F84\u5B8C\u6210\u76EE\u6807\u3002`;
var linkFlipWarnText = (a, b, count) => `
\u26A0\uFE0F \u7CFB\u7EDF\u63D0\u793A\uFF1A\u5143\u7D20\u300C${a}\u300D\u4E0E\u300C${b}\u300D\u7684 select \u5DF2\u4EA4\u66FF\u6210\u529F\u6267\u884C ${count} \u8F6E\u2014\u2014\u9009\u62E9\u5176\u4E2D\u4E00\u4E2A\u540E\u53E6\u4E00\u4E2A\u88AB\u9875\u9762\u56DE\u8BBE/\u6E05\u7A7A\uFF0C\u7591\u4F3C\u8054\u52A8\u5B57\u6BB5\uFF08\u5F53\u524D\u7EC4\u5408\u4E0D\u88AB\u9875\u9762\u63A5\u53D7\uFF09\u3002\u4E0D\u8981\u7EE7\u7EED\u4EA4\u66FF\u91CD\u8BBE\uFF1A\u8BF7\u5148 snapshot \u786E\u8BA4\u4E24\u5B57\u6BB5\u5F53\u524D\u503C\uFF0C\u6539\u9009\u4E0E\u5DF2\u9009\u5B57\u6BB5\u4E00\u81F4\u7684\u7EC4\u5408\uFF08\u5728\u5176\u4E2D\u4E00\u4E2A\u5B57\u6BB5\u7684\u5F53\u524D\u53EF\u9009\u5217\u8868\u91CC\u53E6\u9009\uFF09\uFF0C\u6216\u8C03\u7528 ask_human \u5411\u7528\u6237\u8BF4\u660E\u8BE5\u8054\u52A8\u73B0\u8C61\u5E76\u786E\u8BA4\u76EE\u6807\u7EC4\u5408\u3002`;
async function runToolLoop(opts) {
  const { client, model, reasoningEffort, tools, messages, maxSteps, usageKey, signal, validateFinish, onFailure, onSuccess, onStuck, isProgress, onAssistantContent, onStep } = opts;
  let finished = null;
  let steps = 0;
  const statefulSlots = /* @__PURE__ */ new Map();
  let round = 0;
  let stuckHist = [];
  const stuckTotal = /* @__PURE__ */ new Map();
  const stuckAssistLatched = /* @__PURE__ */ new Set();
  let stuckAbortMsg = null;
  let seeStreak = 0;
  let pendingSeeStep = null;
  let linkHist = [];
  const linkLabels = /* @__PURE__ */ new Map();
  const compactResult = (text, stateful) => {
    if (stateful || text.length <= RESULT_MAX_CHARS) return text;
    return `${text.slice(0, 200)}
\u2026(\u4E2D\u95F4\u7701\u7565)\u2026
${text.slice(-120)}`;
  };
  const demoteOldSlots = (kinds, incomingId) => {
    for (const m of messages) {
      if (m.role !== "tool" || m.tool_call_id === incomingId) continue;
      const slot = statefulSlots.get(m.tool_call_id);
      if (!slot || !kinds.includes(slot.kind)) continue;
      m.content = `\uFF08\u7B2C ${slot.round} \u8F6E\u540C\u69FD\u7ED3\u679C\u5DF2\u7701\u7565\uFF1A\u7D22\u5F15/\u753B\u9762\u5DF2\u5931\u6548\uFF0C\u8BF7\u4EE5\u6700\u65B0\u7ED3\u679C\u4E3A\u51C6\uFF09`;
    }
    for (const m of messages) {
      if (m.role !== "user" || !m.__ttSlotKind || !kinds.includes(m.__ttSlotKind)) continue;
      m.content = `\uFF08\u7B2C ${m.__ttSlotRound} \u8F6E\u7684\u622A\u56FE\u5DF2\u7701\u7565\uFF1A\u753B\u9762\u5DF2\u5931\u6548\uFF0C\u8BF7\u4EE5\u6700\u65B0\u7ED3\u679C\u4E3A\u51C6\uFF09`;
      delete m.__ttSlotKind;
    }
  };
  const shrinkArgs = (raw3) => {
    const text = typeof raw3 === "string" ? raw3 : "";
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === "string" && v.length > TRIM_KEEP_CHARS) obj[k] = `${v.slice(0, TRIM_KEEP_CHARS)}\u2026`;
        }
        return JSON.stringify(obj);
      }
    } catch {
    }
    return text.length > TRIM_KEEP_CHARS * 2 ? `${text.slice(0, TRIM_KEEP_CHARS * 2)}\u2026` : text;
  };
  let lastRoundInput = 0;
  const compressIfNeeded = () => {
    if (lastRoundInput < CONTEXT_WATERMARK_TOKENS) return;
    let seen = 0;
    let cut = 2;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        seen++;
        if (seen > KEEP_RECENT_ROUNDS) {
          cut = i;
          break;
        }
      }
    }
    for (let i = 2; i < cut; i++) {
      const m = messages[i];
      if (m.role === "user" && m.__ttSlotKind) {
        m.content = `\uFF08\u5386\u53F2\u622A\u56FE\u5DF2\u7701\u7565\uFF1A\u753B\u9762\u5DF2\u5931\u6548\uFF09`;
        delete m.__ttSlotKind;
        continue;
      }
      const text = typeof m.content === "string" ? m.content : "";
      if (text.length > TRIM_KEEP_CHARS * 2) {
        m.content = `${text.slice(0, TRIM_KEEP_CHARS)}\u2026\uFF08\u5386\u53F2\u5DF2\u538B\u7F29\uFF09`;
      }
      if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          if (tc?.function?.arguments) tc.function.arguments = shrinkArgs(tc.function.arguments);
        }
      }
    }
  };
  for (let i = 0; i < maxSteps; i++) {
    if (signal?.aborted) break;
    compressIfNeeded();
    round = i + 1;
    const base = { ...getUsage(usageKey) };
    const req = {
      model,
      messages,
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })),
      tool_choice: "auto"
    };
    if (reasoningEffort) req.reasoning_effort = reasoningEffort;
    else {
      req.thinking = { type: "disabled" };
      req.temperature = 0;
    }
    const completion = await client.chat.completions.create(
      req,
      signal ? { signal } : void 0
    );
    lastRoundInput = getUsage(usageKey).inputTokens - base.inputTokens;
    const msg = completion.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];
    if (pendingSeeStep != null && msg?.content) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      try {
        onAssistantContent?.(pendingSeeStep, content);
      } catch {
      }
      pendingSeeStep = null;
    }
    if (!toolCalls.length) {
      return { finished: false, finishMessage: msg?.content ?? void 0, steps };
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    let prev = base;
    const answeredIds = /* @__PURE__ */ new Set();
    for (const tc of toolCalls) {
      if (signal?.aborted) {
        messages.push({ role: "tool", tool_call_id: tc.id, content: "\uFF08\u5DF2\u4E2D\u6B62\uFF09" });
        continue;
      }
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? "{}");
      } catch {
        args = {};
      }
      const tool = tools.find((t) => t.name === tc.function?.name);
      const stateful = Boolean(tool?.stateful);
      let result;
      let resultImage;
      let toolOk = false;
      if (tool?.name === "finish") {
        const rejectMsg = validateFinish ? await validateFinish(args) : null;
        if (rejectMsg) {
          result = rejectMsg;
        } else {
          finished = { success: Boolean(args.success), message: String(args.message ?? "") };
          result = `${"success" in args ? `\u6D4B\u8BD5\u7ED3\u675F\uFF1A${finished.success ? "\u901A\u8FC7" : "\u5931\u8D25"}` : "\u811A\u672C\u751F\u6210\u7ED3\u675F"}${finished.message ? ` \u2014 ${finished.message}` : ""}`;
        }
      } else if (tool) {
        try {
          const r = await tool.execute(args);
          if (typeof r === "string") {
            result = r;
          } else {
            result = r.text;
            resultImage = r.image;
          }
          toolOk = true;
          onSuccess?.(tool.name, args);
        } catch (e) {
          const err = String(e);
          let override = null;
          if (onFailure) {
            try {
              override = await onFailure(tool.name, args, err);
            } catch {
              override = null;
            }
          }
          result = override ?? `\u9519\u8BEF\uFF1A${err}`;
        }
      } else {
        result = `\u672A\u77E5\u5DE5\u5177\uFF1A${tc.function?.name}`;
      }
      const toolName = tc.function?.name ?? "";
      const progressed = toolOk && !finished ? Boolean(isProgress?.(toolName)) : false;
      const sig = stuckSig(toolName, args);
      if (sig && !finished && !progressed) {
        stuckHist.push(sig);
        if (stuckHist.length > STUCK_WINDOW) stuckHist.shift();
        const total = (stuckTotal.get(sig) ?? 0) + 1;
        stuckTotal.set(sig, total);
        const inWindow = stuckHist.filter((s) => s === sig).length;
        if (total >= STUCK_ABORT_AT) {
          stuckAbortMsg = `\u7A7A\u8F6C\u4FDD\u62A4\uFF1A\u540C\u4E00\u64CD\u4F5C\u300C${sig.slice(0, 60)}\u300D\u5DF2\u7D2F\u8BA1\u91CD\u590D ${total} \u6B21\u4ECD\u65E0\u8FDB\u5C55\uFF0C\u4E3A\u907F\u514D\u65E0\u6548\u6D88\u8017\u5DF2\u81EA\u52A8\u7EC8\u6B62\u672C\u6B21\u751F\u6210`;
          result += `
\uFF08\u7A7A\u8F6C\u4FDD\u62A4\uFF1A\u672C\u6B21\u751F\u6210\u5DF2\u88AB\u5F3A\u5236\u7EC8\u6B62\uFF09`;
        } else if (inWindow >= STUCK_ASSIST_AT && !stuckAssistLatched.has(sig)) {
          stuckAssistLatched.add(sig);
          let override = null;
          try {
            override = onStuck ? await onStuck(toolName, args, inWindow) : null;
          } catch {
            override = null;
          }
          if (override != null) {
            result = override;
            stuckHist = stuckHist.filter((s) => s !== sig);
            stuckAssistLatched.delete(sig);
          } else {
            result += stuckWarnText(inWindow);
          }
        } else if (inWindow >= STUCK_WARN_AT) {
          result += stuckWarnText(inWindow);
        }
      }
      if (tool?.name === "see" && !finished && toolOk) {
        seeStreak++;
        if (seeStreak >= SEE_ASSIST_AT) {
          let override = null;
          try {
            override = onStuck ? await onStuck(tool.name, args, seeStreak, "observe") : null;
          } catch {
            override = null;
          }
          if (override != null) result = override;
          else result += observeWarnText(seeStreak);
          seeStreak = 0;
        }
      } else if (tool && toolOk && !finished && progressed) {
        seeStreak = 0;
      }
      if (!finished && toolOk && tool && isSelectLike(toolName, args)) {
        const sel = String(args.selector ?? "").trim();
        if (sel) {
          linkHist.push(sel);
          if (linkHist.length > LINK_WINDOW) linkHist.shift();
          if (args.instruction) linkLabels.set(sel, String(args.instruction).slice(0, 60));
          const flip = linkFlipPair(linkHist);
          if (flip) {
            const label = (s) => linkLabels.get(s) ? `\u300C${linkLabels.get(s)}\u300D(\u5143\u7D20 ${s})` : `\u5143\u7D20 ${s}`;
            let override = null;
            try {
              override = onStuck ? await onStuck(toolName, args, flip.transitions, "linkage", `${label(flip.a)} \u4E0E ${label(flip.b)}`) : null;
            } catch {
              override = null;
            }
            if (override != null) result = override;
            else result += linkFlipWarnText(flip.a, flip.b, flip.transitions);
            linkHist = [];
          }
        }
      }
      const after = { ...getUsage(usageKey) };
      const delta = usageDelta(prev, after);
      prev = after;
      steps++;
      await onStep({ index: steps, name: tc.function?.name ?? "", args, result, usageDelta: delta });
      if ((tc.function?.name ?? "") === "see") pendingSeeStep = steps;
      if (tool?.stateful) {
        demoteOldSlots([tool.stateful, ...tool.supersedes ?? []], tc.id);
        statefulSlots.set(tc.id, { kind: tool.stateful, round });
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: compactResult(result, stateful)
      });
      if (resultImage) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `\uFF08${tc.function?.name ?? ""} \u622A\u56FE\uFF0C\u5BF9\u5E94\u4E0A\u4E00\u6761\u5DE5\u5177\u7ED3\u679C\uFF09` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${resultImage}` } }
          ],
          __ttSlotKind: tool?.stateful ?? "",
          __ttSlotRound: round
        });
      }
      answeredIds.add(tc.id);
      if (stuckAbortMsg) break;
    }
    if (stuckAbortMsg) {
      for (const tc of toolCalls) {
        if (!answeredIds.has(tc.id)) {
          messages.push({ role: "tool", tool_call_id: tc.id, content: "\uFF08\u7A7A\u8F6C\u4FDD\u62A4\u7EC8\u6B62\uFF09" });
        }
      }
      return { finished: false, finishMessage: stuckAbortMsg, steps };
    }
    if (finished) break;
  }
  return { finished: Boolean(finished), finishMessage: finished?.message, finishSuccess: finished?.success, steps };
}

// src/services/generation/preSplit.ts
function semanticActionSection(vocab) {
  if (!vocab.length) return "";
  const lines = vocab.map((v) => `  \xB7 "${v.name}"\uFF1A${(v.doc ?? "").trim()}${v.preferFill ? "\uFF08\u53EF\u8F93\u5165\u63A7\u4EF6\u4F1A\u4F18\u5148\u5C1D\u8BD5\u76F4\u63A5\u586B\u5199\uFF09" : ""}`).join("\n");
  return `

\u3010\u7EC4\u4EF6\u8BED\u4E49\u52A8\u4F5C\u3011\u5F53\u524D\u9879\u76EE\u6CE8\u518C\u4E86\u4EE5\u4E0B\u7EC4\u4EF6\u5E93\u8BED\u4E49\u52A8\u4F5C\u3002\u9047\u5230\u5BF9\u5E94\u7EC4\u4EF6\uFF08\u5982\u7EC4\u4EF6\u5E93\u4E0B\u62C9\u3001\u65E5\u671F\u9009\u62E9\u5668\u7B49\u975E\u539F\u751F\u63A7\u4EF6\uFF09\u65F6\uFF0C\u4F18\u5148\u628A\u8BE5\u64CD\u4F5C\u62C6\u5206\u4E3A**\u4E00\u4E2A**\u8BED\u4E49\u52A8\u4F5C\u6B65\uFF1A"action" \u586B\u52A8\u4F5C\u540D\uFF0C"value" \u586B\u4E3B\u8981\u53C2\u6570\uFF08\u9009\u9879\u6587\u672C/\u65E5\u671F\uFF09\uFF0C\u76EE\u6807\u5143\u7D20\u4ECD\u5199\u5728 "instruction" \u91CC\u2014\u2014\u6267\u884C\u671F\u5E73\u53F0\u4F1A\u81EA\u52A8\u5339\u914D\u7EC4\u4EF6\u5E93\u63D2\u4EF6\u5B8C\u6210\uFF0C\u65E0\u9700\u62C6\u6210\u591A\u6B65\u70B9\u51FB\u3002\u539F\u751F <select> \u4E0E\u666E\u901A\u8F93\u5165\u6846\u4E0D\u8981\u4F7F\u7528\u8BED\u4E49\u52A8\u4F5C\uFF1A
${lines}`;
}
async function splitSystemWithVocab(base, projectId) {
  try {
    const vocab = await enabledActionVocabulary(projectId ?? void 0);
    return base + semanticActionSection(vocab);
  } catch {
    return base;
  }
}
async function preSplit(client, model, systemContent, userContent, envVarHint, reasoningEffort, logId, jobId, images = []) {
  const fullUser = `${envVarHint ? envVarHint + "\n\n" : ""}${userContent}`;
  const userMsgContent = images.length ? [
    { type: "text", text: fullUser },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.imageMime || "image/png"};base64,${img.imageB64}` }
    }))
  ] : fullUser;
  const req = {
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userMsgContent }
    ],
    response_format: { type: "json_object" }
  };
  if (reasoningEffort) req.reasoning_effort = reasoningEffort;
  else {
    req.thinking = { type: "disabled" };
    req.temperature = 0;
  }
  const before = { ...getUsage(jobId) };
  const res = await client.chat.completions.create(req);
  const text = res.choices?.[0]?.message?.content ?? "";
  const usage = usageDelta(before, getUsage(jobId));
  const parsed = safeJsonParse2(stripFences(text));
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
  if (logId) {
    appendStep(logId, {
      type: STEP_TYPE.PLAN,
      system: systemContent,
      user: fullUser,
      assistant: text || null,
      usage
    });
  }
  if (!steps) return { steps: null, usage };
  return {
    steps: steps.map((s) => {
      const instruction = String(s?.instruction ?? "").trim();
      if (!instruction) return null;
      return {
        kind: s?.kind === "assert" ? "assert" : "action",
        instruction,
        action: s?.action,
        url: s?.url != null ? String(s.url) : void 0,
        value: s?.value != null ? String(s.value) : void 0,
        key: s?.key != null ? String(s.key) : void 0,
        assertion: s?.assertion && typeof s.assertion === "object" ? { ...s.assertion } : void 0
      };
    }).filter((s) => s !== null),
    usage
  };
}

// src/services/visualFrameService.ts
import { createHash } from "crypto";
var DEFAULT_INTERVAL_MS = 200;
var DEFAULT_MAX_MS = 3e3;
var STABLE_REQUIRED = 2;
async function shotHash(pwPage) {
  const buf = await pwPage.screenshot({ type: "png", scale: "css" });
  return createHash("sha256").update(buf).digest("hex");
}
var MODEL_JPEG_QUALITY = 80;
async function shotBase64(pwPage, clip) {
  const buf = await pwPage.screenshot({
    type: "jpeg",
    quality: MODEL_JPEG_QUALITY,
    scale: "css",
    ...clip ? { clip } : {}
  });
  return buf.toString("base64");
}
async function waitStable(pwPage, opts) {
  const interval = Math.max(50, opts?.intervalMs ?? DEFAULT_INTERVAL_MS);
  const max = Math.max(interval, opts?.maxMs ?? DEFAULT_MAX_MS);
  const started = Date.now();
  let prev = await shotHash(pwPage);
  let stable = 0;
  while (Date.now() - started < max) {
    await new Promise((r) => setTimeout(r, interval));
    const cur = await shotHash(pwPage);
    if (cur === prev) {
      if (++stable >= STABLE_REQUIRED - 1) {
        return { stable: true, elapsedMs: Date.now() - started };
      }
    } else {
      stable = 0;
    }
    prev = cur;
  }
  return { stable: false, elapsedMs: Date.now() - started };
}
var PAGE_QUIET_MS = 350;
var PAGE_MIN_FRAMES = 3;
var PAGE_STABLE_SCRIPT = `(cfg) => new Promise((resolve) => {
  const g = globalThis;
  const doc = g.document;
  let lastMutation = g.performance.now();
  let frames = 0;
  let done = false;
  let rafId = 0;
  const finish = (stable, reason) => {
    if (done) return;
    done = true;
    obs.disconnect();
    g.clearInterval(poll);
    g.cancelAnimationFrame(rafId);
    resolve({ stable, reason });
  };
  const check = () => {
    if (done) return;
    let running = 0;
    try {
      running = doc.getAnimations().filter((a) => a.playState === 'running').length;
    } catch {
      running = 0; // \u65E0 getAnimations\uFF1A\u9000\u5316\u4E3A\u7EAF\u9759\u9ED8\u7A97\u5224\u5B9A
    }
    if (running === 0 && frames >= cfg.minFrames && g.performance.now() - lastMutation >= cfg.quietMs) {
      finish(true);
    }
  };
  const obs = new g.MutationObserver(() => {
    lastMutation = g.performance.now();
  });
  obs.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  const loop = () => {
    frames++;
    check();
    if (!done) rafId = g.requestAnimationFrame(loop);
  };
  rafId = g.requestAnimationFrame(loop);
  const poll = g.setInterval(check, 100);
  g.setTimeout(() => finish(false, 'timeout'), cfg.maxMs);
})`;
async function waitStableInPage(pwPage, opts) {
  const quietMs = Math.max(100, opts?.quietMs ?? PAGE_QUIET_MS);
  const maxMs = Math.max(quietMs, opts?.maxMs ?? DEFAULT_MAX_MS);
  const started = Date.now();
  try {
    const cfgJson = JSON.stringify({ quietMs, maxMs, minFrames: PAGE_MIN_FRAMES });
    const r = await pwPage.evaluate(`(${PAGE_STABLE_SCRIPT})(${cfgJson})`);
    return { stable: r.stable, elapsedMs: Date.now() - started };
  } catch (e) {
    console.warn("[visualFrame] waitStableInPage \u56DE\u9000\u5E27\u54C8\u5E0C\u7248:", e instanceof Error ? e.message : e);
    return waitStable(pwPage, { maxMs });
  }
}
function effectChanged(beforeHash, afterHash) {
  return beforeHash !== afterHash;
}

// src/services/generationToolHost.ts
function sub(ctx, t) {
  return ctx.sub(t);
}
function semanticSource(selector) {
  const raw3 = String(selector ?? "").trim();
  return /^\d+$/.test(raw3) ? `[data-tt-idx="${Number(raw3)}"]` : raw3;
}
async function resolveLocator(ctx, selector) {
  const raw3 = String(selector ?? "").trim();
  if (/^\d+$/.test(raw3)) {
    return ctx.pwPage.locator(`[data-tt-idx="${Number(raw3)}"]`);
  }
  return ctx.pwPage.locator(raw3.startsWith("/") ? `xpath=${raw3}` : raw3);
}
async function checkOcclusion(ctx, loc) {
  try {
    const handle = await loc.elementHandle({ timeout: 5e3 });
    if (!handle) return null;
    const res = await handle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return { blocked: false };
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || top === el || el.contains(top) || top.contains(el)) return { blocked: false };
      const mask2 = top.closest('.ant-modal-mask, .ant-modal-wrap, .el-overlay, .el-dialog__wrapper, [class*="mask"], [class*="overlay"]');
      return { blocked: true, blocker: String(mask2?.className ?? top.tagName).slice(0, 80) };
    });
    if (res?.blocked) return `\u76EE\u6807\u5143\u7D20\u88AB\u300C${res.blocker}\u300D\u906E\u6321\uFF0C\u8BF7\u5148\u5173\u95ED\u5F39\u5C42/\u906E\u7F69\u518D\u64CD\u4F5C`;
    return null;
  } catch {
    return null;
  }
}
async function detectOverlays(page) {
  try {
    return await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const st = getComputedStyle(el);
        return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) !== 0;
      };
      const anyVisible = (sel) => Array.from(document.querySelectorAll(sel)).some(visible);
      return {
        dialog: anyVisible('dialog[open],[role="dialog"],[role="alertdialog"],.el-dialog,.el-drawer,.el-message-box,.ant-modal,.ant-drawer'),
        dropdown: anyVisible('[role="listbox"],.el-select-dropdown,.el-dropdown-menu,.el-picker-panel,.el-cascader__dropdown,.ant-select-dropdown,.ant-picker-dropdown')
      };
    });
  } catch {
    return { dialog: false, dropdown: false };
  }
}
var ACTION_TIMEOUT_MS = 15e3;
async function runActionShell(ctx, action, args, extra) {
  const selector = String(args.selector ?? "").trim();
  if (!selector) throw new Error(`${action} \u7F3A\u5C11 selector\uFF08\u5143\u7D20\u7F16\u53F7\u6216\u5B9A\u4F4D\u8868\u8FBE\u5F0F\uFF09`);
  const instruction = String(args.instruction ?? "").trim();
  if (!instruction) throw new Error(`${action} \u7F3A\u5C11 instruction\uFF08\u672C\u6B65\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF09`);
  const loc = await resolveLocator(ctx, selector);
  const blocked = await checkOcclusion(ctx, loc);
  if (blocked) return `\u9519\u8BEF\uFF1A${blocked}`;
  const rawValue = args.value != null ? String(args.value) : void 0;
  const realValue = sub(ctx, rawValue);
  const semPre = await semanticizeLocator(ctx.pwPage, semanticSource(selector), { mode: "playwright", noRawFallback: true }).catch(() => null);
  switch (action) {
    case "fill":
      await loc.fill(realValue ?? "", { timeout: ACTION_TIMEOUT_MS });
      break;
    case "select":
      await loc.selectOption(String(realValue ?? ""), { timeout: ACTION_TIMEOUT_MS });
      break;
    case "press":
      await loc.click({ timeout: ACTION_TIMEOUT_MS });
      await ctx.pwPage.keyboard.press(extra?.pressKey ?? "Enter");
      break;
    case "check":
      await loc.check({ timeout: ACTION_TIMEOUT_MS });
      break;
    default: {
      const before = await shotHash(ctx.pwPage).catch(() => null);
      await loc.click({ timeout: ACTION_TIMEOUT_MS });
      if (before) {
        await new Promise((r) => setTimeout(r, 400));
        const after = await shotHash(ctx.pwPage).catch(() => null);
        if (after && !effectChanged(before, after)) {
          ctx.note("\u70B9\u51FB\u540E\u753B\u9762\u65E0\u53D8\u5316");
          return `\u8B66\u544A\uFF1A\u70B9\u51FB\u5DF2\u6267\u884C\u4F46\u753B\u9762\u65E0\u53D8\u5316\uFF08\u53EF\u80FD\u672A\u751F\u6548\uFF0C\u5EFA\u8BAE\u91CD\u65B0 snapshot \u786E\u8BA4\u72B6\u6001\uFF09\u3002${\u5DF2\u843D\u5E93\u63D0\u793A(ctx)}`;
        }
      }
    }
  }
  const sem = semPre ?? await semanticizeLocator(ctx.pwPage, semanticSource(selector), { mode: "playwright" });
  const step = buildStep(action, sem, instruction, action === "fill" || action === "select" ? rawValue : void 0, action === "press" ? extra?.pressKey ?? "Enter" : void 0);
  const oc = await ctx.emit(step);
  ctx.note(`${instruction}\uFF08${action}\uFF09`);
  return `${actionLabel(action)}\u5B8C\u6210${realValue ? `\uFF1A${realValue}` : ""}\u3002${\u843D\u5E93\u63D0\u793A(ctx, oc)}`;
}
function buildStep(action, sem, instruction, value, key) {
  const base = { kind: "action", action, locator: sem, instruction, description: instruction };
  if (value != null) return { ...base, value };
  if (key) return { ...base, key };
  return base;
}
function actionLabel(a) {
  return { click: "\u70B9\u51FB", fill: "\u586B\u5199", select: "\u9009\u62E9", press: "\u6309\u952E", check: "\u52FE\u9009" }[a] ?? a;
}
function \u5DF2\u843D\u5E93\u63D0\u793A(ctx) {
  return `\uFF08\u5DF2\u8BB0\u5F55\u4E3A\u7B2C ${ctx.stepCount()} \u6B65\uFF09`;
}
function \u843D\u5E93\u63D0\u793A(ctx, oc) {
  return oc ? `\uFF08\u5DF2\u8BB0\u5F55\u4E3A\u7B2C ${oc.index} \u6B65\uFF09` : \u5DF2\u843D\u5E93\u63D0\u793A(ctx);
}
async function doSnapshot(ctx) {
  let idxLines = [];
  try {
    idxLines = await ctx.pwPage.evaluate(() => window.__ttCollectInteractive ? window.__ttCollectInteractive() : []);
  } catch {
  }
  const idxText = idxLines.length ? idxLines.join("\n") : "\uFF08\u7F16\u53F7\u6536\u96C6\u5931\u8D25\uFF0C\u8BF7\u7528 css/xpath \u5B9A\u4F4D\uFF09";
  return `\u3010\u53EF\u4EA4\u4E92\u5143\u7D20\u7F16\u53F7\uFF08\u5DE5\u5177 selector \u586B [n] \u7684\u6570\u5B57\uFF1B\u5E26 * \u4E3A\u672C\u6B21\u65B0\u51FA\u73B0\uFF0C\u5982\u5F39\u5C42\u5185\u5BB9\uFF09\u3011
${idxText}`;
}
async function doPageTree(ctx) {
  const snap = await ctx.page.snapshot();
  const tree = String(snap?.formattedTree ?? "");
  ctx.xpathMap = snap?.xpathMap ?? {};
  const trimmed = tree.length > 45e3 ? tree.slice(0, 45e3) + "\n\u2026(\u5DF2\u622A\u65AD)" : tree;
  return `\u3010\u9875\u9762\u8BED\u4E49\u6811\uFF08\u5C42\u7EA7\u7ED3\u6784 + \u6587\u672C\u3002\u6811\u5185\u7F16\u53F7\u4E3A\u7ED3\u6784 id\uFF0C\u4E0D\u80FD\u7528\u4F5C\u5DE5\u5177 selector\uFF1B\u5B9A\u4F4D\u4E00\u5F8B\u4EE5\u6700\u65B0 snapshot \u7F16\u53F7\u8868\u7684\u6570\u5B57\u4E3A\u51C6\uFF09\u3011
${trimmed}`;
}
function buildGenTools(ctx, finishValidate, askHuman) {
  const tools = [
    {
      name: "snapshot",
      description: "\u83B7\u53D6\u5F53\u524D\u9875\u9762\u53EF\u4EA4\u4E92\u5143\u7D20\u7F16\u53F7\u8868\uFF08\u5DE5\u5177 selector \u586B [n] \u7684\u6570\u5B57\uFF09\u3002\u64CD\u4F5C\u524D\u5FC5\u770B\uFF1B\u9875\u9762\u53D8\u5316\u540E\u91CD\u65B0\u83B7\u53D6\u3002\u7F16\u53F7\u53EA\u5728\u6700\u65B0\u5FEB\u7167\u5185\u6709\u6548\u3002\u9ED8\u8BA4\u4E0D\u542B\u5B8C\u6574\u9875\u9762\u7ED3\u6784\uFF0C\u9700\u8981\u5C42\u7EA7\u7ED3\u6784\u65F6\u7528 page_tree\u3002",
      parameters: { type: "object", properties: {} },
      stateful: "snapshot",
      supersedes: ["tree"],
      // 新快照 = 页面已变化，旧结构树层级信息一并失效
      execute: async () => doSnapshot(ctx)
    },
    {
      name: "page_tree",
      description: "\u83B7\u53D6\u5F53\u524D\u9875\u9762\u5B8C\u6574\u8BED\u4E49\u6811\uFF08\u5C42\u7EA7\u7ED3\u6784 + \u6587\u672C\uFF0C\u4F53\u79EF\u5927\uFF0C\u4EC5\u5728\u9700\u8981\u65F6\u8C03\u7528\uFF09\u3002\u7528\u4E8E\u7F16\u53F7\u8868\u770B\u4E0D\u51FA\u7684\u95EE\u9898\uFF1A\u76EE\u6807\u4E0D\u5728\u7F16\u53F7\u8868\u3001\u9700\u8981\u7406\u89E3\u533A\u57DF\u5C42\u7EA7/\u6392\u67E5\u7ED3\u6784\u7C7B\u95EE\u9898\u3002\u6811\u5185\u7F16\u53F7\u662F\u7ED3\u6784 id\uFF0C\u4E0D\u80FD\u7528\u4F5C\u5DE5\u5177 selector\u3002",
      parameters: { type: "object", properties: {} },
      stateful: "tree",
      execute: async () => doPageTree(ctx)
    },
    {
      name: "goto",
      description: "\u5BFC\u822A\u5230\u6307\u5B9A URL\u3002args.url + args.instruction\uFF08\u5FC5\u586B\uFF09",
      parameters: {
        type: "object",
        properties: { url: { type: "string" }, instruction: { type: "string" } },
        required: ["url", "instruction"]
      },
      execute: async (a) => {
        const u = String(a.url ?? "");
        await ctx.page.goto(sub(ctx, u) ?? u);
        const oc = await ctx.emit({ kind: "navigate", action: "goto", url: u, instruction: String(a.instruction), description: String(a.instruction) });
        return `\u5DF2\u5BFC\u822A\u5230 ${u}\u3002${\u843D\u5E93\u63D0\u793A(ctx, oc)}`;
      }
    },
    {
      name: "click",
      description: "\u70B9\u51FB\u5143\u7D20\uFF08\u7F16\u53F7\u6216\u5B9A\u4F4D\u8868\u8FBE\u5F0F\uFF09\u3002args.selector + args.instruction\uFF08\u5FC5\u586B\uFF09",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, instruction: { type: "string" } },
        required: ["selector", "instruction"]
      },
      execute: async (a) => runActionShell(ctx, "click", a)
    },
    {
      name: "fill",
      description: "\u586B\u5199\u8F93\u5165\u6846\u3002args.selector + args.value + args.instruction\uFF08\u5FC5\u586B\uFF09",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, value: { type: "string" }, instruction: { type: "string" } },
        required: ["selector", "value", "instruction"]
      },
      execute: async (a) => runActionShell(ctx, "fill", a)
    },
    {
      name: "press",
      description: "\u70B9\u51FB\u5143\u7D20\u540E\u6309\u952E\uFF08\u9ED8\u8BA4 Enter\uFF09\u3002args.selector + args.key? + args.instruction\uFF08\u5FC5\u586B\uFF09",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, key: { type: "string" }, instruction: { type: "string" } },
        required: ["selector", "instruction"]
      },
      execute: async (a) => runActionShell(ctx, "press", a, { pressKey: String(a.key ?? "Enter") })
    },
    {
      name: "check",
      description: "\u52FE\u9009/\u53D6\u6D88\u52FE\u9009\u590D\u9009\u6846\u3002args.selector + args.instruction\uFF08\u5FC5\u586B\uFF09",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, instruction: { type: "string" } },
        required: ["selector", "instruction"]
      },
      execute: async (a) => runActionShell(ctx, "check", a)
    },
    {
      name: "select",
      description: "\u539F\u751F <select> \u4E0B\u62C9\u9009\u62E9\u3002\u7EC4\u4EF6\u5E93\u5047\u63A7\u4EF6\uFF08antd/element \u4E0B\u62C9\uFF09\u8BF7\u6539\u7528 component_action \u7684 select \u8BED\u4E49\u52A8\u4F5C\uFF08\u539F\u751F/\u7EC4\u4EF6\u5E93\u4E0B\u62C9\u7EDF\u4E00\u5165\u53E3\uFF0C\u81EA\u52A8\u6309\u4F18\u5148\u7EA7\u9002\u914D\uFF09\u3002args.selector + args.value + args.instruction",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, value: { type: "string" }, instruction: { type: "string" } },
        required: ["selector", "value", "instruction"]
      },
      execute: async (a) => {
        try {
          return await runActionShell(ctx, "select", a);
        } catch (e) {
          return `\u9519\u8BEF\uFF1A${String(e)}\u3002\u63D0\u793A\uFF1A\u7EC4\u4EF6\u5E93\u5047\u63A7\u4EF6\u4E0D\u652F\u6301\u539F\u751F selectOption\uFF0C\u8BF7\u6539\u7528 component_action \u7684 select \u8BED\u4E49\u52A8\u4F5C\u6216 click+click \u4E24\u6BB5\u5F0F\u3002`;
        }
      }
    },
    {
      name: "wait",
      description: "\u7B49\u5F85\u9875\u9762\u6E32\u67D3\u7A33\u5B9A\uFF08\u591A\u5E27\u50CF\u7D20\u54C8\u5E0C\uFF0C\u52A8\u753B/\u52A0\u8F7D\u7ED3\u675F\u5373\u8FD4\u56DE\uFF1B\u4E0A\u9650 3s\uFF09\u3002args.ms? \u4E3A\u6700\u5C0F\u7B49\u5F85\u6BEB\u79D2",
      parameters: { type: "object", properties: { ms: { type: "string" } } },
      execute: async (a) => {
        const minMs = Math.max(0, Number(a.ms) || 0);
        if (minMs) await new Promise((r2) => setTimeout(r2, minMs));
        const r = await waitStableInPage(ctx.pwPage);
        return r.stable ? `\u9875\u9762\u5DF2\u7A33\u5B9A\uFF08${r.elapsedMs}ms\uFF09` : `\u5DF2\u8FBE\u7B49\u5F85\u4E0A\u9650 3s\uFF08\u9875\u9762\u4ECD\u6709\u53D8\u5316\uFF0C\u53EF\u80FD\u662F\u6301\u7EED\u52A8\u753B\uFF09`;
      }
    },
    {
      name: "readText",
      description: "\u8BFB\u53D6\u5143\u7D20\u6587\u672C\u5185\u5BB9\u3002args.selector",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"]
      },
      execute: async (a) => {
        const loc = await resolveLocator(ctx, String(a.selector ?? ""));
        const text = await loc.textContent({ timeout: 8e3 });
        return String(text ?? "").slice(0, 800) || "(\u7A7A)";
      }
    },
    {
      name: "assert",
      description: "\u65AD\u8A00\uFF1Atype=visible(\u5143\u7D20\u53EF\u89C1)|text(\u9875\u9762\u542B\u6587\u672C)|url(URL \u5339\u914D)\u3002args.type + args.selector?/args.expected? + args.instruction\uFF08\u5FC5\u586B\uFF09\u3002\u811A\u672C\u5FC5\u987B\u4EE5\u81F3\u5C11\u4E00\u6761\u65AD\u8A00\u7ED3\u5C3E\u3002",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["visible", "text", "url"] },
          selector: { type: "string" },
          expected: { type: "string" },
          instruction: { type: "string" }
        },
        required: ["type", "instruction"]
      },
      execute: async (a) => {
        const type = String(a.type);
        const instruction = String(a.instruction ?? "").trim() || `\u65AD\u8A00 ${type}`;
        let ok = false;
        let expect = String(a.expected ?? "");
        if (type === "visible") {
          const loc = await resolveLocator(ctx, String(a.selector ?? ""));
          ok = await loc.isVisible();
          expect = expect || String(a.selector ?? "");
        } else if (type === "text") {
          const body = await ctx.pwPage.locator("body").textContent({ timeout: 8e3 });
          expect = String(a.expected ?? "");
          const realExpect = sub(ctx, expect) ?? expect;
          ok = realExpect ? (body ?? "").includes(realExpect) : false;
        } else if (type === "url") {
          const u = String(ctx.page.url?.() ?? await ctx.page.url());
          const expected = sub(ctx, expect || a.selector);
          ok = expected ? u.includes(String(expected)) : false;
        } else {
          throw new Error(`\u672A\u77E5\u65AD\u8A00\u7C7B\u578B\uFF1A${type}`);
        }
        if (!ok) throw new Error(`\u65AD\u8A00\u672A\u901A\u8FC7\uFF08${type}\uFF09\uFF1A\u671F\u671B ${expect || "(\u5143\u7D20\u53EF\u89C1)"}\uFF0C\u5B9E\u9645\u4E0D\u6EE1\u8DB3`);
        const assertSem = type === "visible" && a.selector ? await semanticizeLocator(ctx.pwPage, semanticSource(String(a.selector)), { mode: "playwright" }).catch(() => null) : null;
        const oc = await ctx.emit({ kind: "assert", action: "assert", assertion: { type, expected: expect || void 0 }, ...assertSem ? { locator: assertSem } : {}, instruction, description: instruction });
        return `\u65AD\u8A00\u901A\u8FC7\uFF08${type}\uFF09\u3002${\u843D\u5E93\u63D0\u793A(ctx, oc)}`;
      }
    },
    {
      name: "act",
      description: "\u81EA\u7136\u8BED\u8A00\u515C\u5E95\u64CD\u4F5C\uFF08\u8BED\u4E49\u5316\u5B9A\u4F4D\u5931\u8D25\u65F6\u7528\uFF0C\u8BA9\u6D4F\u89C8\u5668 AI \u76F4\u63A5\u7406\u89E3\u6307\u4EE4\u6267\u884C\uFF09\u3002args.instruction\uFF08\u5FC5\u586B\uFF09\u3002\u4E0D\u8981\u7528 Escape \u5173\u95ED\u5F39\u7A97\u5185\u5C55\u5F00\u7684\u4E0B\u62C9\u2014\u2014\u4F1A\u628A\u6574\u4E2A\u5F39\u7A97\u5173\u6389\u3001\u5DF2\u586B\u8868\u5355\u5168\u4E22\uFF1B\u6536\u8D77\u4E0B\u62C9\u6539\u70B9\u89E6\u53D1\u5668\u6216\u76F4\u63A5\u70B9\u9009\u9879\uFF0C\u5173\u95ED\u5F39\u7A97\u6539\u70B9\u300C\u53D6\u6D88/\u5173\u95ED\u300D\u6309\u94AE\u3002",
      parameters: {
        type: "object",
        properties: { instruction: { type: "string" } },
        required: ["instruction"]
      },
      execute: async (a) => {
        const instruction = sub(ctx, String(a.instruction ?? ""));
        if (/\b(?:esc|escape)\b/i.test(String(a.instruction ?? ""))) {
          const ov = await detectOverlays(ctx.pwPage);
          if (ov.dialog || ov.dropdown) {
            const scene = [ov.dropdown && "\u5C55\u5F00\u7684\u4E0B\u62C9\u9762\u677F", ov.dialog && "\u5F39\u7A97"].filter(Boolean).join(" + ");
            return `\u5DF2\u62E6\u622A\u300C\u6309 Escape\u300D\uFF1A\u5F53\u524D\u9875\u9762\u6709${scene}\uFF0CEscape \u53EF\u80FD\u628A\u6574\u4E2A\u5F39\u7A97\u4E00\u8D77\u5173\u95ED\u3001\u5DF2\u586B\u5185\u5BB9\u5168\u90E8\u4E22\u5931\u3002\u8BF7\u6539\u7528\uFF1A\u6536\u8D77\u4E0B\u62C9\u2192\u518D\u70B9\u4E00\u6B21\u89E6\u53D1\u5668\u6216\u76F4\u63A5\u70B9\u9009\u76EE\u6807\u9009\u9879\uFF1B\u5173\u95ED\u5F39\u7A97\u2192\u70B9\u300C\u53D6\u6D88/\u5173\u95ED\u300D\u6309\u94AE\u6216\u53F3\u4E0A\u89D2 \xD7\u3002`;
          }
        }
        const res = await ctx.stagehand.act(instruction, { page: ctx.page });
        const first = res?.data?.actions?.[0];
        if (!res?.data?.success) throw new Error(`act \u672A\u80FD\u5B8C\u6210\uFF1A${instruction}`);
        let loc = null;
        if (first?.selector) {
          loc = await semanticizeLocator(ctx.pwPage, first.selector, { mode: "playwright" }).catch(() => null);
        }
        const method = first?.method ? String(first.method) : "";
        const act = { click: "click", type: "fill", fill: "fill", press: "press", select: "select", selectOption: "select", check: "check", uncheck: "check" }[method] ?? "click";
        const arg0 = first?.arguments?.[0] != null ? String(first.arguments[0]) : void 0;
        const step = loc ? buildStep(act, loc, String(a.instruction), act === "fill" || act === "select" ? arg0 : void 0, act === "press" ? arg0 ?? "Enter" : void 0) : { kind: "action", action: act, instruction: String(a.instruction), description: String(a.instruction), ...arg0 ? { value: arg0 } : {} };
        const oc = await ctx.emit(step);
        return `act \u5DF2\u5B8C\u6210\uFF1A${instruction}\u3002${\u843D\u5E93\u63D0\u793A(ctx, oc)}`;
      }
    },
    ...ctx.modelVision ? [
      {
        name: "see",
        description: "\u89C6\u89C9\u89C2\u5BDF\u5F53\u524D\u9875\u9762\uFF1A\u622A\u56FE\uFF08\u5E26\u7F16\u53F7\u6807\u6CE8\uFF09\u76F4\u63A5\u9644\u4E8E\u7ED3\u679C\u8FDB\u5165\u4E0A\u4E0B\u6587\uFF08\u6BD4\u6587\u672C\u5FEB\u7167\u7701 token\uFF0C\u4E5F\u65E0\u5B50\u8C03\u7528\uFF09\u3002\u84DD\u8272\u8FB9\u6846\u4E0A\u7684\u767D\u8272\u6570\u5B57 = snapshot \u5143\u7D20\u7F16\u53F7\uFF0C\u53EF\u76F4\u63A5\u7528\u4E8E selector\u3002\u7528\u4E8E\u786E\u8BA4\u9875\u9762\u72B6\u6001/\u6392\u67E5\u6E32\u67D3\u9519\u4E71/\u56FE\u8868/\u9A8C\u8BC1\u7801/toast \u7B49\u89C6\u89C9\u95EE\u9898\u3002args.x/y/w/h \u4E3A\u53EF\u9009\u88C1\u526A\u533A\u57DF\uFF08px\uFF09\uFF0C\u88C1\u526A\u53EF\u63D0\u5347\u5C0F\u533A\u57DF\u6E05\u6670\u5EA6\u3002",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string", description: "\u5173\u6CE8\u7684\u95EE\u9898\uFF08\u53EF\u9009\uFF09" },
            x: { type: "number", description: "\u88C1\u526A\u533A\u57DF\u5DE6\u4E0A\u89D2 x\uFF08\u53EF\u9009\uFF09" },
            y: { type: "number", description: "\u88C1\u526A\u533A\u57DF\u5DE6\u4E0A\u89D2 y\uFF08\u53EF\u9009\uFF09" },
            w: { type: "number", description: "\u88C1\u526A\u533A\u57DF\u5BBD\uFF08\u53EF\u9009\uFF09" },
            h: { type: "number", description: "\u88C1\u526A\u533A\u57DF\u9AD8\uFF08\u53EF\u9009\uFF09" }
          }
        },
        // 视觉观察与快照同为「当前画面」状态：新观察回灌时历史同槽（含所附截图）降级为占位，防止上下文累积
        stateful: "screenshot",
        execute: async (a) => {
          await ctx.pwPage.evaluate(() => {
            try {
              if (window.__ttCollectInteractive) window.__ttCollectInteractive();
              if (window.__ttDrawOverlays) window.__ttDrawOverlays();
            } catch {
            }
          });
          const region = a.x != null && a.y != null && a.w != null && a.h != null ? { x: Number(a.x), y: Number(a.y), width: Number(a.w), height: Number(a.h) } : void 0;
          const b64 = await shotBase64(ctx.pwPage, region).finally(async () => {
            await ctx.pwPage.evaluate(() => {
              try {
                if (window.__ttClearOverlays) window.__ttClearOverlays();
              } catch {
              }
            });
          });
          const q = String(a.question ?? "\u63CF\u8FF0\u9875\u9762\u5F53\u524D\u72B6\u6001\u4E0E\u53EF\u4EA4\u4E92\u5143\u7D20").slice(0, 200);
          return {
            text: `\u622A\u56FE\u5DF2\u9644\u4E8E\u4E0B\u4E00\u6761\u6D88\u606F\uFF08\u84DD\u8272\u8FB9\u6846\u4E0A\u7684\u767D\u8272\u6570\u5B57\u4E3A\u5143\u7D20\u7F16\u53F7\uFF0C\u4E0E snapshot \u7F16\u53F7\u4E00\u81F4\uFF0C\u53EF\u76F4\u63A5\u7528\u4F5C\u5DE5\u5177 selector\uFF09\u3002\u89C2\u5BDF\u8BF7\u6C42\uFF1A${q}\u3002\u8BF7\u4F9D\u636E\u622A\u56FE\u4F5C\u7B54\u5E76\u51B3\u5B9A\u4E0B\u4E00\u6B65\u3002`,
            image: b64
          };
        }
      }
    ] : [],
    // 接口响应查询：感知层兜底——错误可能只在接口响应里（如「手机号码重复」）、页面上看不到，
    // 模型反复点击提交前应先用本工具查看状态码与响应体。纯观察不 emit。
    {
      name: "api",
      description: "\u67E5\u8BE2\u9875\u9762\u6700\u8FD1\u6355\u83B7\u7684\u7F51\u7EDC\u63A5\u53E3\u8BF7\u6C42/\u54CD\u5E94\uFF08XHR/fetch \u7B49\uFF09\u3002\u63D0\u4EA4\u8868\u5355\u6216\u70B9\u51FB \u786E\u5B9A/\u63D0\u4EA4/\u4FDD\u5B58 \u540E\uFF0C\u82E5\u5F39\u7A97\u672A\u5173\u95ED\u3001\u9875\u9762\u65E0\u53D8\u5316\u6216\u7591\u4F3C\u5931\u8D25\uFF0C\u5148\u7528\u672C\u5DE5\u5177\u67E5\u770B\u63A5\u53E3\u72B6\u6001\u7801\u4E0E\u54CD\u5E94\u4F53\u5B9A\u4F4D\u771F\u5B9E\u9519\u8BEF\u2014\u2014\u9519\u8BEF\u53EF\u80FD\u53EA\u5728\u63A5\u53E3\u54CD\u5E94\u91CC\u3001\u9875\u9762\u4E0A\u770B\u4E0D\u5230\u3002\u4E0D\u5E26\u53C2\u6570=\u5217\u51FA\u6700\u8FD1\u8BF7\u6C42\uFF1Bargs.keyword \u6309 URL \u5B50\u4E32\u8FC7\u6EE4\u5217\u8868\uFF1Bargs.id=\u6761\u76EE id \u67E5\u770B\u8BE5\u6761\u54CD\u5E94\u4F53\uFF08\u53EF\u52A0 args.search \u5728\u54CD\u5E94\u4F53\u5185\u641C\u5173\u952E\u5B57\uFF09\uFF1B\u53EA\u7ED9 args.search=\u5728\u6240\u6709\u54CD\u5E94\u4F53\u91CC\u641C\u5173\u952E\u5B57\u3002",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "\u6309 URL \u5B50\u4E32\u8FC7\u6EE4\uFF08\u5217\u8868\u6A21\u5F0F\uFF09" },
          id: { type: "string", description: "\u6761\u76EE id\uFF08\u67E5\u770B\u8BE5\u6761\u54CD\u5E94\u4F53\uFF09" },
          search: { type: "string", description: "\u54CD\u5E94\u4F53\u5185\u641C\u7D22\u7684\u5173\u952E\u5B57" }
        }
      },
      // 与快照同为「当前状态」：新查询回灌时旧列表/响应体结果降级为一行占位，防止上下文累积
      stateful: "network",
      execute: async (a) => {
        const id = Number(a.id);
        if (Number.isFinite(id) && id > 0) return ctx.network.getBody(id, a.search != null ? String(a.search) : void 0);
        const search = a.search != null ? String(a.search).trim() : "";
        if (search) return ctx.network.searchInBodies(a.keyword != null ? String(a.keyword) : void 0, search);
        return ctx.network.list(a.keyword != null ? String(a.keyword) : void 0);
      }
    }
  ];
  if (ctx.pluginActions.length) {
    const vocabDesc = ctx.pluginActions.map((v) => `- ${v.name}\uFF1A${v.doc ?? ""}${v.preferFill ? "\uFF08\u4F18\u5148\u76F4\u63A5\u586B\u5199\uFF09" : ""}`).join("\n");
    tools.push({
      name: "component_action",
      description: `\u7EC4\u4EF6\u5E93\u8BED\u4E49\u52A8\u4F5C\uFF1A\u5BF9\u7EC4\u4EF6\u5E93\u5047\u63A7\u4EF6\uFF08antd/element \u7684\u4E0B\u62C9\u3001\u65E5\u671F\u9009\u62E9\u5668\u7B49\u975E\u539F\u751F\u63A7\u4EF6\uFF09\u6267\u884C\u6CE8\u518C\u7684\u8BED\u4E49\u52A8\u4F5C\uFF0C\u5E73\u53F0\u81EA\u52A8\u6309\u4F18\u5148\u7EA7\u5339\u914D\u7EC4\u4EF6\u5E93\u63D2\u4EF6\u5B8C\u6210\uFF08\u5931\u8D25\u81EA\u52A8\u964D\u7EA7\uFF1A\u4E0B\u4E00\u63D2\u4EF6 \u2192 \u539F\u751F\u4EA4\u4E92\uFF09\u3002\u52A8\u4F5C\u81EA\u8EAB\u4F1A\u6253\u5F00/\u6536\u8D77\u5F39\u5C42\u7B49\u4E34\u65F6 UI\uFF1A\u76F4\u63A5\u5BF9\u76EE\u6807\u63A7\u4EF6\u8C03\u7528\u5373\u53EF\uFF0C\u65E0\u9700\u5148\u70B9\u51FB\u5B83\u6253\u5F00\uFF08\u5982\u5148\u70B9\u5F00\u4E0B\u62C9\uFF09\uFF1B\u4E0D\u786E\u5B9A\u9009\u9879/\u503C\u662F\u5426\u5B58\u5728\u4E5F\u53EF\u76F4\u63A5\u8C03\u7528\uFF0C\u5931\u8D25\u7ED3\u679C\u4F1A\u5217\u51FA\u5F53\u524D\u53EF\u9009\u9879\u3002args.action=\u52A8\u4F5C\u540D\uFF08\u9650\u4E0B\u65B9\u8BCD\u8868\uFF09+ args.selector\uFF08\u76EE\u6807\u5143\u7D20\u7F16\u53F7\u6216\u5B9A\u4F4D\u8868\u8FBE\u5F0F\uFF09+ args.value\uFF08\u4E3B\u8981\u53C2\u6570\uFF1A\u9009\u9879\u6587\u672C/\u65E5\u671F\uFF09+ args.instruction\uFF08\u5FC5\u586B\uFF09\u3002
\u53EF\u7528\u52A8\u4F5C\u8BCD\u8868\uFF1A
${vocabDesc}`,
      parameters: componentActionParameters(ctx.pluginActions.map((v) => v.name)),
      execute: (a) => runComponentAction(ctx, a)
    });
  }
  if (askHuman) {
    tools.push({
      name: "ask_human",
      description: "\u4E3B\u52A8\u5411\u7528\u6237\u6C42\u52A9\uFF08\u6302\u8D77\u751F\u6210\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u51B3\u7B56\uFF09\u3002\u611F\u5230\u56F0\u60D1\u65F6\u7ACB\u5373\u8C03\u7528\uFF0C\u4E0D\u8981\u5728\u56F0\u60D1\u4E2D\u53CD\u590D\u8BD5\u9519\uFF1A\u6362\u8FC7\u4E0D\u540C\u65B9\u5F0F\u4ECD\u65E0\u6CD5\u8FBE\u6210\u76EE\u6807\u3001\u9875\u9762\u72B6\u6001\u4E0E\u9884\u671F\u4E0D\u7B26\u4E14\u770B\u4E0D\u51FA\u539F\u56E0\u3001\u7F16\u53F7\u8868\u548C\u7ED3\u6784\u6811\u91CC\u90FD\u627E\u4E0D\u5230\u76EE\u6807\u3001\u6216\u4E0B\u4E00\u6B65\u53EA\u80FD\u662F\u91CD\u590D\u4E4B\u524D\u5DF2\u505A\u8FC7\u7684\u64CD\u4F5C\u3002args.question \u7B80\u8FF0\u56F0\u60D1\u70B9\u4E0E\u5DF2\u5C1D\u8BD5\u7684\u505A\u6CD5\uFF08\u5C06\u5C55\u793A\u7ED9\u7528\u6237\uFF09\u3002",
      parameters: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"]
      },
      execute: async (a) => askHuman(String(a.question ?? "").trim() || "\uFF08\u672A\u8BF4\u660E\u56F0\u60D1\u70B9\uFF09")
    });
  }
  tools.push({
    name: "revise",
    description: '\u4FEE\u8BA2\u5DF2\u8BB0\u5F55\u7684\u811A\u672C\u6B65\u9AA4\uFF08\u53EA\u6539\u811A\u672C\uFF0C\u4E0D\u6267\u884C\u6D4F\u89C8\u5668\u52A8\u4F5C\uFF0C\u4E0D\u5F71\u54CD\u5F53\u524D\u9875\u9762\u72B6\u6001\uFF09\u3002\u9002\u7528\u573A\u666F\uFF08\u4FEE\u6B63\u540E\u91CD\u505A\u63D0\u4EA4\u65F6\uFF0C\u4FEE\u8BA2\u5DF2\u843D\u6B65\u9AA4\u800C\u4E0D\u662F\u8FFD\u52A0\u91CD\u590D\u6B65\u9AA4\uFF0C\u8BA9\u56DE\u653E\u811A\u672C\u4FDD\u6301\u6700\u77ED\u6210\u529F\u8DEF\u5F84\uFF09\uFF1A\u2460 \u63D0\u4EA4\u5931\u8D25\u4E14\u662F\u53C2\u6570\u95EE\u9898\uFF08\u5982\u624B\u673A\u53F7\u91CD\u590D\u3001\u540D\u79F0\u5DF2\u5B58\u5728\u3001\u503C\u4E0D\u5408\u6CD5\uFF09\u9700\u8981\u6362\u503C\u91CD\u8BD5\u2014\u2014\u6539 value\u3001\u5220\u9664\u5197\u4F59\u7684\u65E7\u503C\u63D0\u4EA4/\u91CD\u586B\u94FE\uFF1B\u2461 \u70B9\u51FB\u63D0\u4EA4\u540E\u5F39\u7A97\u672A\u5173\u3001\u88AB\u5FC5\u586B\u6821\u9A8C\u62E6\u622A\uFF08\u63D0\u4EA4\u672A\u751F\u6548\uFF09\u2014\u2014\u8865\u586B\u7F3A\u5931\u5B57\u6BB5\u91CD\u65B0\u63D0\u4EA4\u6210\u529F\u540E\uFF0C\u5220\u9664\u5148\u524D\u843D\u7A7A\u7684\u65E7\u63D0\u4EA4\u6B65\u3002args.ops \u64CD\u4F5C\u6570\u7EC4\uFF0C\u5E8F\u53F7\u4E0E\u672C\u8F6E\u5DE5\u5177\u7ED3\u679C\u91CC\u300C\u5DF2\u8BB0\u5F55\u4E3A\u7B2C N \u6B65\u300D\u7684 N \u4E00\u81F4\uFF081-based\uFF0C\u4EC5\u672C\u8F6E\u751F\u6210\u5185\uFF1B\u53EF\u4FEE\u8BA2\u8303\u56F4\u89C1\u8FD4\u56DE\u7684\u6E05\u5355\uFF09\uFF1A\n- {"op":"update","step":9,"value":"\u65B0\u503C"} \u4FEE\u6539\u7B2C 9 \u6B65\u7684\u586B\u5199\u503C\uFF08\u53EF\u6539 value/key/instruction/expected\uFF0C\u53EA\u6539\u7ED9\u51FA\u7684\u5B57\u6BB5\uFF1Bexpected \u4EC5\u65AD\u8A00\u6B65\uFF09\n- {"op":"delete","from":12,"to":13} \u5220\u9664\u7B2C 12~13 \u6B65\uFF08\u542B\u7AEF\u70B9\uFF1B\u7701\u7565 to = \u53EA\u5220 from\uFF09\nops \u6309\u987A\u5E8F\u6267\u884C\uFF0C\u5148\u5220\u540E\u6539\u4F1A\u4F7F\u540E\u9762\u7684\u5E8F\u53F7\u79FB\u4F4D\uFF08\u4EE5\u8FD4\u56DE\u7684\u6700\u65B0\u6B65\u9AA4\u6E05\u5355\u4E3A\u51C6\uFF09\u3002\u4FEE\u8BA2\u540E\u7EE7\u7EED\u6B63\u5E38\u6267\u884C\u5269\u4F59\u52A8\u4F5C\u3002',
    parameters: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          description: "\u4FEE\u8BA2\u64CD\u4F5C\u6570\u7EC4\uFF08\u6309\u987A\u5E8F\u6267\u884C\uFF09",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["update", "delete"] },
              step: { type: "number", description: "update\uFF1A\u5F85\u6539\u6B65\u9AA4\u5E8F\u53F7\uFF081-based\uFF09" },
              from: { type: "number", description: "delete\uFF1A\u8D77\u59CB\u6B65\u5E8F\u53F7\uFF081-based\uFF09" },
              to: { type: "number", description: "delete\uFF1A\u7ED3\u675F\u6B65\u5E8F\u53F7\uFF08\u542B\u7AEF\u70B9\uFF0C\u7701\u7565 = \u53EA\u5220 from\uFF09" },
              value: { type: "string", description: "update\uFF1A\u65B0\u7684\u586B\u5199/\u9009\u62E9\u503C" },
              key: { type: "string", description: "update\uFF1A\u65B0\u7684\u6309\u952E" },
              instruction: { type: "string", description: "update\uFF1A\u65B0\u7684\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0" },
              expected: { type: "string", description: "update\uFF1A\u65AD\u8A00\u6B65\u65B0\u7684\u671F\u671B\u503C" }
            },
            required: ["op"]
          }
        }
      },
      required: ["ops"]
    },
    execute: async (a) => {
      const ops = a.ops;
      if (!Array.isArray(ops)) throw new Error("revise \u7F3A\u5C11 ops\uFF08\u4FEE\u8BA2\u64CD\u4F5C\u6570\u7EC4\uFF09");
      return ctx.revise(ops);
    }
  });
  tools.push({
    name: "finish",
    description: "\u5B8C\u6210\u811A\u672C\u751F\u6210\u3002\u5FC5\u987B\u5DF2\u6709\u81F3\u5C11\u4E00\u6761\u65AD\u8A00\u6B65\u9AA4\uFF08\u672B\u6B65\u4E3A\u65AD\u8A00\uFF09\u3002args.message \u53EF\u9009\u603B\u7ED3\u3002",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } }
    },
    execute: async (a) => {
      const reject = finishValidate ? await finishValidate(a) : null;
      if (reject) throw new Error(reject);
      return `\u811A\u672C\u751F\u6210\u5B8C\u6210\u3002${a.message ?? ""}`;
    }
  });
  return tools;
}
async function invokeInPage(ctx, pluginId, action, handle, args) {
  const run = ctx.pwPage.evaluate(
    async ([pid, act, target, actionArgs]) => {
      const reg = globalThis.__ttPluginRegistry__;
      if (!reg) throw new Error("\u9875\u9762\u672A\u6CE8\u5165\u63D2\u4EF6\u8FD0\u884C\u65F6\uFF1A\u8BF7\u68C0\u67E5\u9879\u76EE\u7684\u7EC4\u4EF6\u9884\u8BBE");
      const el = target && target.isConnected ? target : null;
      return await reg.invokeAction(pid, act, el, actionArgs ?? {});
    },
    [pluginId, action, handle, args]
  );
  return await Promise.race([
    run,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`\u63D2\u4EF6\u52A8\u4F5C ${pluginId}.${action} \u6267\u884C\u8D85\u65F6\uFF0815s\uFF09`)), 15e3))
  ]);
}
async function resolveChainInPage(ctx, action, handle) {
  try {
    const chain = await ctx.pwPage.evaluate(
      ([act, target]) => {
        const reg = globalThis.__ttPluginRegistry__;
        if (!reg || !target || !target.isConnected) return [];
        return reg.resolveChain(target, act);
      },
      [action, handle]
    );
    return Array.isArray(chain) ? chain : [];
  } catch {
    return [];
  }
}
async function verifyChainInPage(ctx, chain, action, handle, args) {
  if (!chain.length) return null;
  try {
    const verdicts = await ctx.pwPage.evaluate(
      async ([act, target, actionArgs, ids]) => {
        const reg = globalThis.__ttPluginRegistry__;
        if (!reg) return null;
        const el = target && target.isConnected ? target : null;
        const out = [];
        for (const pid of ids) {
          out.push(await reg.invokeVerify(pid, act, el, actionArgs ?? {}));
        }
        return out;
      },
      [action, handle, args, chain.map((c) => c.id)]
    );
    if (!Array.isArray(verdicts)) return null;
    if (verdicts.some((v) => v === true)) return true;
    if (verdicts.some((v) => v === false)) return false;
    return null;
  } catch {
    return null;
  }
}
async function emitSemanticActionStep(ctx, action, selector, instruction, winner, rawValue, extraArgs, pre) {
  const sem = pre ?? await semanticizeLocator(ctx.pwPage, semanticSource(selector), { mode: "playwright" }).catch(() => null);
  if (!sem) return null;
  return ctx.emit(
    buildPluginActionStep(action, sem, instruction, {
      pluginId: winner,
      value: rawValue,
      args: extraArgs,
      // 插件声明的展示名随步骤落库（状态标签/导出等展示点直接取用，无需再查词表）
      label: ctx.pluginActions.find((v) => v.name === action)?.label
    })
  );
}
async function runComponentAction(ctx, a) {
  const action = String(a.action ?? "").trim();
  const selector = String(a.selector ?? "").trim();
  if (!action) throw new Error("component_action \u7F3A\u5C11 action\uFF08\u8BED\u4E49\u52A8\u4F5C\u540D\uFF09");
  if (!selector) throw new Error("component_action \u7F3A\u5C11 selector\uFF08\u5143\u7D20\u7F16\u53F7\u6216\u5B9A\u4F4D\u8868\u8FBE\u5F0F\uFF09");
  const instruction = String(a.instruction ?? "").trim() || action;
  const entry = ctx.pluginActions.find((v) => v.name === action);
  if (!entry) {
    return `\u9519\u8BEF\uFF1A\u672A\u6CE8\u518C\u7684\u8BED\u4E49\u52A8\u4F5C\u300C${action}\u300D\u3002\u53EF\u7528\u52A8\u4F5C\uFF1A${ctx.pluginActions.map((v) => v.name).join("\u3001") || "\uFF08\u65E0\uFF09"}\u3002`;
  }
  const loc = await resolveLocator(ctx, selector);
  const handle = await loc.elementHandle({ timeout: 8e3 }).catch(() => null);
  if (!handle) return `\u9519\u8BEF\uFF1A\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20\uFF08${selector}\uFF09\u3002\u8BF7\u91CD\u65B0 snapshot \u786E\u8BA4\u7F16\u53F7\u540E\u91CD\u8BD5\u3002`;
  const semPre = await semanticizeLocator(ctx.pwPage, semanticSource(selector), { mode: "playwright", noRawFallback: true }).catch(() => null);
  const rawValue = a.value != null ? String(a.value) : void 0;
  const value = sub(ctx, rawValue);
  const extraArgs = a.args && typeof a.args === "object" ? a.args : {};
  const actionArgs = { ...extraArgs, ...value != null ? { value } : {} };
  const beforeHash = await shotHash(ctx.pwPage).catch(() => null);
  const finishOk = async (winner, message) => {
    const oc = await emitSemanticActionStep(ctx, action, selector, instruction, winner, rawValue, extraArgs, semPre);
    ctx.note(`${instruction}\uFF08${action}${winner ? ` via ${winner}` : ""}\uFF09`);
    return `${message}\u3002${oc ? \u843D\u5E93\u63D0\u793A(ctx, oc) : `\uFF08\u8BED\u4E49\u5B9A\u4F4D\u5931\u8D25\uFF0C\u672C\u6B65\u672A\u843D\u5E93\uFF09`}`;
  };
  if (entry.preferFill && value != null) {
    try {
      await loc.fill(value);
      await ctx.pwPage.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 300));
      const chain2 = await resolveChainInPage(ctx, action, handle);
      const verdict = await verifyChainInPage(ctx, chain2, action, handle, actionArgs);
      if (verdict === true) {
        return await finishOk(void 0, `\u5DF2\u901A\u8FC7\u8F93\u5165\u65B9\u5F0F\u8BBE\u7F6E\uFF1A${value}`);
      }
      if (verdict !== false) {
        const afterHash = await shotHash(ctx.pwPage).catch(() => null);
        if (beforeHash && afterHash && effectChanged(beforeHash, afterHash)) {
          return await finishOk(void 0, `\u5DF2\u901A\u8FC7\u8F93\u5165\u65B9\u5F0F\u8BBE\u7F6E\uFF1A${value}`);
        }
      }
    } catch {
    }
  }
  const chain = await resolveChainInPage(ctx, action, handle);
  const attempted = [];
  let chainMessage = "";
  for (const hit of chain) {
    attempted.push(hit.id);
    const result = await invokeInPage(ctx, hit.id, action, handle, actionArgs).catch((e) => ({ status: "failed", message: String(e) }));
    if (result.status === "success") return await finishOk(hit.id, result.message || `\u5DF2\u7531\u63D2\u4EF6 ${hit.id} \u5B8C\u6210`);
    if (result.status === "uncertain") {
      await new Promise((r) => setTimeout(r, 300));
      const afterHash = await shotHash(ctx.pwPage).catch(() => null);
      if (beforeHash && afterHash && effectChanged(beforeHash, afterHash)) {
        return await finishOk(hit.id, result.message || `\u5DF2\u7531\u63D2\u4EF6 ${hit.id} \u5B8C\u6210\uFF08\u6548\u679C\u6821\u9A8C\u901A\u8FC7\uFF09`);
      }
    }
    chainMessage = result.message;
  }
  let nativeMessage = "";
  try {
    if (action === "select") {
      await loc.selectOption(String(value ?? ""));
    } else if (value != null) {
      await loc.fill(String(value ?? ""));
    } else {
      await loc.click();
    }
    const verdict = await verifyChainInPage(ctx, chain, action, handle, actionArgs);
    if (verdict === false) {
      nativeMessage = "\u539F\u751F\u4EA4\u4E92\u5DF2\u6267\u884C\u4F46\u9875\u5185\u540E\u9A8C\u672A\u901A\u8FC7\uFF08\u7EC8\u6001\u4E0E\u9884\u671F\u4E0D\u7B26\uFF0C\u503C\u672A\u771F\u6B63\u63D0\u4EA4\uFF09";
    } else {
      return await finishOk(void 0, `\u5DF2\u901A\u8FC7\u539F\u751F\u4EA4\u4E92\u5B8C\u6210 ${action}`);
    }
  } catch (e) {
    nativeMessage = String(e);
  }
  const detail = [
    chainMessage.trim() ? `\u63D2\u4EF6\u94FE\uFF1A${chainMessage.trim()}` : "",
    nativeMessage.trim() ? `\u539F\u751F\u4EA4\u4E92\uFF1A${nativeMessage.trim()}` : ""
  ].filter(Boolean).join("\uFF1B");
  const guide = /（当前(可选|可见)：/.test(chainMessage) ? "\u8BF7\u4ECE\u4E0A\u65B9\u300C\u5F53\u524D\u53EF\u9009/\u5F53\u524D\u53EF\u89C1\u300D\u6E05\u5355\u4E2D\u53D6\u6B63\u786E\u6587\u672C\uFF0C\u4EC5\u4FEE\u6B63 args.value \u91CD\u8BD5\u672C\u52A8\u4F5C\uFF08\u5176\u4F59\u53C2\u6570\u4E0D\u53D8\uFF09\uFF0C\u4E0D\u8981\u6539\u7528\u4E24\u6BB5\u5F0F\u70B9\u51FB\u6216 act\u3002" : /禁用/.test(chainMessage) ? "\u8BE5\u503C\u683C\u5F0F\u5408\u6CD5\u4F46\u88AB\u5E94\u7528\u89C4\u5219\u7981\u7528\uFF08\u5982\u65E5\u671F\u4E0D\u53EF\u65E9\u4E8E\u4ECA\u5929\uFF09\uFF0C\u8BF7\u4EC5\u4FEE\u6B63 args.value \u4E3A\u53EF\u7528\u503C\uFF08\u5982\u672A\u6765\u65E5\u671F\uFF09\u91CD\u8BD5\u672C\u52A8\u4F5C\uFF08\u5176\u4F59\u53C2\u6570\u4E0D\u53D8\uFF09\u3002" : "\u8BF7 snapshot \u786E\u8BA4\u5F53\u524D\u9875\u9762\u72B6\u6001\u540E\u6362\u8DEF\u5F84\uFF08\u4E24\u6BB5\u5F0F\u70B9\u51FB\u3001\u4FEE\u6B63\u53C2\u6570\u6216 act\uFF09\u3002";
  return `\u9519\u8BEF\uFF1A\u8BED\u4E49\u52A8\u4F5C ${action} \u5168\u94FE\u5931\u8D25\uFF08\u5C1D\u8BD5\u987A\u5E8F\uFF1A${attempted.join(" \u2192 ") || "\u65E0\u5339\u914D\u63D2\u4EF6"}\uFF09\u3002${(detail || "\u65E0\u9519\u8BEF\u4FE1\u606F").slice(0, 300)}\u3002${guide}`;
}

// src/services/networkCaptureService.ts
var MAX_ENTRIES = 200;
var URL_MAX = 120;
var LIST_MAX = 60;
var LIST_CHARS = 2500;
var BODY_HEAD = 3e3;
var BODY_TAIL = 800;
var BODY_PENDING_MS = 2e3;
var NetworkCapture = class {
  entries = [];
  nextId = 1;
  responseHandlers = [];
  contextHandlers = [];
  disposed = false;
  /** 挂载到页面；同时订阅 context 的 page 事件，弹窗/新标签自动覆盖。可多次调用。 */
  attach(page) {
    if (this.disposed) return;
    const onResponse = (res) => this.onResponse(res);
    page.on("response", onResponse);
    this.responseHandlers.push([page, onResponse]);
    let context = null;
    try {
      context = page.context();
    } catch {
    }
    if (context && !this.contextHandlers.some(([c]) => c === context)) {
      const onPage = (p) => {
        try {
          this.attach(p);
        } catch {
        }
      };
      context.on("page", onPage);
      this.contextHandlers.push([context, onPage]);
    }
  }
  onResponse(res) {
    try {
      const req = res.request();
      let type = "";
      try {
        type = String(req.resourceType() ?? "");
      } catch {
      }
      const status = Number(res.status?.() ?? 0);
      if (type !== "xhr" && type !== "fetch" && status < 400) return;
      const entry = {
        id: this.nextId++,
        url: String(res.url?.() ?? ""),
        method: String(req.method?.() ?? ""),
        status,
        statusText: String(res.statusText?.() ?? ""),
        ts: Date.now()
      };
      this.entries.push(entry);
      if (this.entries.length > MAX_ENTRIES) this.entries.shift();
      const ct = String(res.headers?.()["content-type"] ?? "");
      if (ct === "" || /(json|text|html|xml|javascript|form-urlencoded)/i.test(ct)) {
        entry.pending = res.text().then((body) => {
          entry.body = body.length > 2e4 ? body.slice(0, 2e4) + "\u2026[\u622A\u65AD]" : body;
        }).catch(() => {
        });
      }
    } catch {
    }
  }
  filtered(keyword) {
    const kw = keyword?.trim().toLowerCase();
    return kw ? this.entries.filter((e) => e.url.toLowerCase().includes(kw)) : this.entries;
  }
  line(e) {
    const st = e.statusText ? ` ${e.statusText}` : "";
    const url = e.url.length > URL_MAX ? e.url.slice(0, URL_MAX) + "\u2026" : e.url;
    return `#${e.id} ${e.method} ${e.status}${st} ${url}`;
  }
  /** 列出最近捕获的请求（keyword 为 URL 子串过滤，大小写不敏感），最新在后。 */
  list(keyword) {
    const rows = this.filtered(keyword);
    if (!rows.length) return keyword?.trim() ? `\uFF08\u672A\u6355\u83B7 URL \u542B\u300C${keyword.trim()}\u300D\u7684\u8BF7\u6C42\uFF09` : "\uFF08\u6682\u65E0\u6355\u83B7\u7684\u7F51\u7EDC\u8BF7\u6C42\uFF09";
    const lines = [];
    let used = 0;
    for (let i = rows.length - 1; i >= 0 && lines.length < LIST_MAX; i--) {
      const l = this.line(rows[i]);
      if (used + l.length + 1 > LIST_CHARS && lines.length > 0) break;
      lines.unshift(l);
      used += l.length + 1;
    }
    const omitted = rows.length - lines.length;
    return (omitted > 0 ? `\uFF08\u66F4\u65E9 ${omitted} \u6761\u5DF2\u7701\u7565\uFF0C\u53EF\u7528 keyword \u8FC7\u6EE4\uFF09
` : "") + lines.join("\n");
  }
  /** 查看条目响应体（body 未回填时短等 2s）；search 在响应体内找关键字并展示片段。 */
  async getBody(id, search) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return `\uFF08\u672A\u627E\u5230\u6761\u76EE #${id}\uFF1A\u53EF\u80FD\u5C1A\u672A\u6355\u83B7\u6216\u5DF2\u88AB\u79FB\u51FA\u7F13\u51B2\uFF0C\u53EF\u5148\u8C03\u7528\u5217\u8868\u67E5\u770B\u73B0\u6709\u6761\u76EE\uFF09`;
    if (e.body == null && e.pending) {
      await Promise.race([e.pending, new Promise((r) => setTimeout(r, BODY_PENDING_MS))]);
    }
    const head = this.line(e);
    if (e.body == null) return `${head}
\uFF08\u65E0\u54CD\u5E94\u4F53\u6216\u8BFB\u53D6\u5931\u8D25\uFF1A\u975E\u6587\u672C\u7C7B\u54CD\u5E94\uFF0C\u6216\u6D4F\u89C8\u5668\u5DF2\u4E22\u5F03\u8BE5\u54CD\u5E94\uFF09`;
    const kw = search?.trim();
    if (kw) {
      const idx = e.body.indexOf(kw);
      if (idx < 0) return `${head}
\uFF08\u54CD\u5E94\u4F53\u5185\u672A\u627E\u5230\u300C${kw}\u300D\uFF0Cbody \u957F\u5EA6 ${e.body.length} \u5B57\u7B26\uFF09`;
      const from = Math.max(0, idx - 200);
      const to = Math.min(e.body.length, idx + kw.length + 200);
      const frag = (from > 0 ? "\u2026" : "") + e.body.slice(from, to) + (to < e.body.length ? "\u2026" : "");
      return `${head}
\u54CD\u5E94\u4F53\u547D\u4E2D\u300C${kw}\u300D\u7247\u6BB5\uFF1A
${frag}`;
    }
    const body = e.body.length > BODY_HEAD + BODY_TAIL ? e.body.slice(0, BODY_HEAD) + "\n\u2026(\u4E2D\u95F4\u7701\u7565)\u2026\n" + e.body.slice(-BODY_TAIL) : e.body;
    return `${head}
${body}`;
  }
  /** 在过滤后条目的响应体内搜关键字（最多 5 条命中，各带片段）。 */
  searchInBodies(urlKeyword, text) {
    const kw = text.trim();
    if (!kw) return "\uFF08\u7F3A\u5C11\u641C\u7D22\u5173\u952E\u5B57\uFF09";
    const rows = this.filtered(urlKeyword);
    const hits = [];
    for (const e of rows) {
      if (!e.body) continue;
      const idx = e.body.indexOf(kw);
      if (idx < 0) continue;
      const from = Math.max(0, idx - 100);
      const to = Math.min(e.body.length, idx + kw.length + 100);
      hits.push(`${this.line(e)}
  ${(from > 0 ? "\u2026" : "") + e.body.slice(from, to) + (to < e.body.length ? "\u2026" : "")}`);
      if (hits.length >= 5) break;
    }
    if (!hits.length) {
      const reading = rows.filter((e) => e.pending && e.body == null).length;
      return `\uFF08\u672A\u5728\u54CD\u5E94\u4F53\u4E2D\u627E\u5230\u300C${kw}\u300D${reading ? `\uFF1B${reading} \u6761\u54CD\u5E94\u4F53\u4ECD\u5728\u8BFB\u53D6\u4E2D\uFF0C\u53EF\u7A0D\u540E\u91CD\u8BD5` : ""}\uFF09`;
    }
    return hits.join("\n");
  }
  /** 移除全部监听（幂等）；缓冲随实例回收。 */
  dispose() {
    this.disposed = true;
    for (const [page, h] of this.responseHandlers.splice(0)) {
      try {
        page.off("response", h);
      } catch {
      }
    }
    for (const [context, h] of this.contextHandlers.splice(0)) {
      try {
        context.off("page", h);
      } catch {
      }
    }
  }
};

// src/services/generation/manualCapture.ts
var CAPTURE_TIMEOUT_MS = 10 * 6e4;
var CAPTURE_SCRIPT = `(() => {
  window.__tt_buffer = [];
  if (window.__tt_capturing) return;
  window.__tt_capturing = true;
  const esc = (s) => CSS.escape(String(s));
  const selOf = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + esc(el.id);
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let part = n.tagName.toLowerCase();
      const parent = n.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(part);
      n = parent;
    }
    return parts.join(' > ');
  };
  const send = (evt) => { try { window.__tt_buffer.push(evt); } catch (e) {} };
  let fillTimer = null;
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? (e.target.closest('a,button,input,textarea,select,[role="button"]') || e.target) : null;
    if (!el) return;
    send({ type: 'click', selector: selOf(el) });
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => send({ type: 'fill', selector: selOf(el), value: el.value }), 400);
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el instanceof HTMLSelectElement) send({ type: 'select', selector: selOf(el), value: el.value });
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) send({ type: 'fill', selector: selOf(el), value: el.value });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target instanceof Element ? (e.target.closest('input,textarea') || e.target) : null;
    if (!el) return;
    send({ type: 'press', selector: selOf(el), key: 'Enter' });
  }, true);
})();`;
function buildCapturedStep(evt, locator, instruction) {
  const base = { kind: "action", instruction, description: instruction, ...locator ? { locator } : {} };
  if (evt.type === "click") return { ...base, action: "click" };
  if (evt.type === "fill") return { ...base, action: "fill", value: evt.value ?? "" };
  if (evt.type === "select") return { ...base, action: "select", value: evt.value ?? "" };
  return { ...base, action: "press", key: evt.key ?? "Enter" };
}
function capturedEventLabel(evt) {
  if (evt.type === "click") return "\u70B9\u51FB";
  if (evt.type === "fill") return `\u586B\u5199\u300C${trunc2(String(evt.value ?? ""), 40)}\u300D`;
  if (evt.type === "select") return `\u9009\u62E9\u300C${trunc2(String(evt.value ?? ""), 40)}\u300D`;
  return `\u56DE\u8F66`;
}
function createManualCapture(deps) {
  const { jobId, pwPage, emit, isCancelled } = deps;
  const pollCapturedEvent = () => new Promise((resolve) => {
    const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
    let reinject = false;
    const timer = setInterval(() => {
      if (isCancelled() || Date.now() > deadline) {
        clearInterval(timer);
        resolve(null);
        return;
      }
      void (async () => {
        try {
          if (reinject) {
            reinject = false;
            await pwPage.evaluate(CAPTURE_SCRIPT);
          }
          const buf = await pwPage.evaluate(() => globalThis.__tt_buffer || []);
          if (buf.length) {
            clearInterval(timer);
            resolve(buf[0]);
          }
        } catch {
          reinject = true;
        }
      })();
    }, 400);
  });
  return async (context) => {
    try {
      await pwPage.evaluate(CAPTURE_SCRIPT);
    } catch {
    }
    pub({ type: "gen:assist-status", jobId, status: "manual", message: "\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u5B8C\u6210\u8BE5\u6B65\u9AA4\uFF08\u70B9\u51FB/\u8F93\u5165/\u56DE\u8F66\uFF09\u2026" });
    const evt = await pollCapturedEvent();
    if (isCancelled()) return "\uFF08\u751F\u6210\u5DF2\u53D6\u6D88\uFF09";
    if (!evt) return `\u4EBA\u5DE5\u534F\u52A9\u8D85\u65F6\u672A\u54CD\u5E94\uFF1A${context}`;
    const loc = await semanticizeLocator(pwPage, evt.selector, { mode: "playwright" }).catch(() => null);
    const instruction = trunc2(context, 120) || `\u624B\u52A8${capturedEventLabel(evt)}`;
    const step = buildCapturedStep(evt, loc ?? void 0, instruction);
    const oc = await emit(step);
    pubToolWithUsage(jobId, 0, "\u624B\u52A8\u6355\u83B7", `${evt.type} ${evt.selector}`, `\u624B\u52A8\u6355\u83B7\uFF1A${capturedEventLabel(evt)}\uFF08${evt.selector}\uFF09`, {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0
    });
    const where = `\u5DF2\u8BB0\u5F55\u4E3A\u7B2C ${oc.index} \u6B65`;
    return `\u3010\u7528\u6237\u5F15\u5BFC\u3011\u7528\u6237\u5DF2\u624B\u52A8\u5728\u6D4F\u89C8\u5668\u5B8C\u6210\u64CD\u4F5C\uFF1A${capturedEventLabel(evt)}\uFF08${evt.selector}\uFF09\uFF0C\u7CFB\u7EDF\u5DF2\u6355\u83B7\u5E76${where}\u3002\u8BF7\u91CD\u65B0 snapshot \u786E\u8BA4\u5F53\u524D\u9875\u9762\u72B6\u6001\uFF0C\u4ECE\u65B0\u72B6\u6001\u7EE7\u7EED\u5B8C\u6210\u76EE\u6807\uFF08\u4E0D\u8981\u91CD\u590D\u8BE5\u64CD\u4F5C\uFF09\u3002`;
  };
}

// src/services/generation/generationLoop.ts
var MAX_ASSIST_PER_STEP = 3;
var ASSERT_FAIL_ASSIST_AT = 2;
var GEN_OBSERVATION_TOOLS = /* @__PURE__ */ new Set(["snapshot", "page_tree", "wait", "readText", "see", "api"]);
var GEN_LOOP_SYSTEM_PROMPT = `\u4F60\u662F Web \u6D4B\u8BD5\u811A\u672C\u751F\u6210 Agent\uFF1A\u901A\u8FC7\u8C03\u7528\u5DE5\u5177\u5728\u771F\u5B9E\u6D4F\u89C8\u5668\u91CC\u5B8C\u6210\u6D4B\u8BD5\u76EE\u6807\uFF0C\u6BCF\u4E00\u6B65\u6210\u529F\u64CD\u4F5C\u90FD\u4F1A\u81EA\u52A8\u8BB0\u5F55\u4E3A\u811A\u672C\u6B65\u9AA4\u3002

\u64CD\u4F5C\u89C4\u8303\uFF1A
1. \u52A8\u624B\u524D\u5148\u8C03\u7528 snapshot \u83B7\u53D6\u53EF\u4EA4\u4E92\u5143\u7D20\u7F16\u53F7\u8868\uFF1B\u9875\u9762\u53D1\u751F\u53D8\u5316\uFF08\u5BFC\u822A/\u5F39\u5C42/\u65B0\u589E\u5185\u5BB9\uFF09\u540E\u5FC5\u987B\u91CD\u65B0 snapshot\u3002\u4EC5\u9700\u786E\u8BA4\u9875\u9762\u72B6\u6001/\u67E5\u770B\u89C6\u89C9\u7EBF\u7D22\uFF08toast/\u5F39\u5C42/\u6E32\u67D3\u95EE\u9898\uFF09\u65F6\uFF0C\u4F18\u5148\u7528 see\uFF08\u622A\u56FE\u76F4\u8FBE\u3001\u66F4\u7701\uFF09\uFF1B\u56FE\u4E0A\u770B\u4E0D\u6E05\u6216\u627E\u4E0D\u5230\u76EE\u6807\u518D\u56DE\u5230 snapshot\u3002
2. \u5143\u7D20\u5F15\u7528\uFF1A\u5DE5\u5177\u7684 selector \u53C2\u6570\u586B snapshot \u7F16\u53F7\u8868\u91CC\u7684\u5143\u7D20\u7F16\u53F7\uFF08\u5982 "12"\uFF09\uFF1B\u7F16\u53F7\u53EA\u5728\u6700\u65B0\u4E00\u6B21 snapshot \u540E\u6709\u6548\u3002\u7F16\u53F7\u8868\u91CC\u627E\u4E0D\u5230\u76EE\u6807\u3001\u6216\u9700\u8981\u9875\u9762\u5C42\u7EA7\u7ED3\u6784\u65F6\uFF0C\u624D\u8C03\u7528 page_tree \u83B7\u53D6\u5B8C\u6574\u8BED\u4E49\u6811\uFF08\u4F53\u79EF\u5927\uFF0C\u4E0D\u8981\u53CD\u590D\u8C03\u7528\uFF09\uFF1B\u6811\u5185\u7F16\u53F7\u4E0D\u80FD\u7528\u4F5C selector\u3002
3. \u6BCF\u4E2A\u52A8\u4F5C\u5DE5\u5177\u7684 instruction \u5FC5\u586B\uFF1A\u5199\u4E00\u53E5\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\uFF08\u5982\u300C\u70B9\u51FB\u767B\u5F55\u6309\u94AE\u300D\uFF09\uFF0C\u5B83\u4F1A\u88AB\u4FDD\u5B58\u8FDB\u811A\u672C\u7528\u4E8E\u56DE\u653E\u81EA\u6108\u3002
4. \u7EC4\u4EF6\u5E93\u5047\u63A7\u4EF6\uFF08antd/element \u7684\u4E0B\u62C9\u3001\u65E5\u671F\u9762\u677F\u7B49\uFF09\u4E0D\u662F\u539F\u751F\u63A7\u4EF6\uFF1A\u4E0D\u8981\u5BF9\u4E0B\u62C9\u89E6\u53D1\u5668\u7528 fill/select \u539F\u751F\u65B9\u5F0F\uFF1B\u82E5\u53EF\u7528\u5DE5\u5177\u4E2D\u6709 component_action\uFF08\u7EC4\u4EF6\u8BED\u4E49\u52A8\u4F5C\uFF0C\u5982\u9009\u62E9\u4E0B\u62C9\u9009\u9879\u3001\u8BBE\u7F6E\u65E5\u671F\uFF09\uFF0C\u4F18\u5148\u4F7F\u7528\u5B83\u3002
5. \u53EF\u8F93\u5165\u63A7\u4EF6\uFF08\u65E5\u671F\u8F93\u5165\u6846\u7B49\uFF09\u76F4\u63A5\u7528 fill \u586B\u503C\uFF08\u5982\u65E5\u671F 2026-05-04\uFF09\uFF0C\u4E0D\u8981\u9010\u683C\u70B9\u51FB\u3002
6. wait \u5DE5\u5177\u7528\u4E8E\u7B49\u5F85\u5F39\u5C42\u52A8\u753B/\u52A0\u8F7D\u7ED3\u675F\uFF08\u591A\u5E27\u7A33\u5B9A\u5224\u5B9A\uFF09\uFF0C\u4E0D\u8981\u76F2\u76EE\u8FDE\u7EED\u70B9\u51FB\u3002
7. \u9047\u5230\u9519\u8BEF\u4E0D\u8981\u91CD\u590D\u540C\u4E00\u64CD\u4F5C\uFF1A\u5148 snapshot \u67E5\u770B\u5F53\u524D\u72B6\u6001\uFF0C\u6362\u8DEF\u5F84\u6216\u8C03\u6574\u53C2\u6570\uFF1B\u8FDE\u7EED\u5931\u8D25\u4F1A\u8BF7\u6C42\u4EBA\u5DE5\u534F\u52A9\u3002\u5DF2\u6210\u529F\u6267\u884C\u7684\u6B65\u9AA4\u90FD\u4F1A\u81EA\u52A8\u8BB0\u5F55\u4E3A\u811A\u672C\u6B65\u9AA4\uFF0C\u4E0D\u8981\u91CD\u505A\u2014\u2014\u91CD\u590D\u767B\u5F55/\u91CD\u590D\u63D0\u4EA4\u53EA\u4F1A\u4EA7\u751F\u5197\u4F59\u6B65\u9AA4\u3001\u8FD8\u53EF\u80FD\u7834\u574F\u5F53\u524D\u9875\u9762\u72B6\u6001\u3002
8. \u7EA7\u8054/\u8054\u52A8\u4E0B\u62C9\uFF1A\u82E5\u9009\u62E9\u67D0\u5B57\u6BB5\u540E\u53E6\u4E00\u4E2A\u5B57\u6BB5\u7684\u503C\u88AB\u9875\u9762\u6E05\u7A7A/\u56DE\u8BBE\uFF0C\u8BF4\u660E\u4E24\u8005\u662F\u8054\u52A8\u5B57\u6BB5\u3001\u6240\u9009\u7EC4\u5408\u4E0D\u88AB\u9875\u9762\u63A5\u53D7\u2014\u2014\u5148\u9009\u7236\u5B57\u6BB5\uFF08\u5982\u90E8\u95E8\uFF09\uFF0C\u518D\u6253\u5F00\u5B50\u5B57\u6BB5\u4E0B\u62C9\u3001\u4ECE\u5F53\u524D\u53EF\u9009\u5217\u8868\u91CC\u9009\u62E9\u5339\u914D\u7684\u5B50\u9879\uFF08\u5982\u8BE5\u90E8\u95E8\u4E0B\u7684\u8D26\u53F7\uFF09\uFF1B\u82E5\u9009\u5B8C\u5B50\u9879\u7236\u5B57\u6BB5\u4ECD\u88AB\u6253\u56DE\uFF0C\u6362\u5B50\u5B57\u6BB5\u5F53\u524D\u53EF\u9009\u5217\u8868\u91CC\u7684\u5176\u4ED6\u9009\u9879\uFF0C\u6216\u8C03\u7528 ask_human \u8BF4\u660E\u8054\u52A8\u73B0\u8C61\u8BF7\u7528\u6237\u786E\u8BA4\u76EE\u6807\u7EC4\u5408\uFF1B\u4E0D\u8981\u4EA4\u66FF\u53CD\u590D\u91CD\u8BBE\u4E24\u4E2A\u4E92\u76F8\u6253\u56DE\u7684\u5B57\u6BB5\u3002
9. \u611F\u5230\u56F0\u60D1\u65F6\u4E0D\u8981\u53CD\u590D\u8BD5\u9519\uFF0C\u7ACB\u5373\u8C03\u7528 ask_human \u4E3B\u52A8\u5411\u7528\u6237\u6C42\u52A9\uFF08\u6302\u8D77\u751F\u6210\u3001\u7B49\u5F85\u4EBA\u5DE5\u51B3\u7B56\uFF09\u3002\u4EE5\u4E0B\u60C5\u51B5\u89C6\u4E3A\u56F0\u60D1\uFF1A\u6362\u8FC7\u4E0D\u540C\u65B9\u5F0F\u4ECD\u65E0\u6CD5\u8FBE\u6210\u76EE\u6807\u3001\u9875\u9762\u72B6\u6001\u4E0E\u9884\u671F\u4E0D\u7B26\u4E14\u770B\u4E0D\u51FA\u539F\u56E0\u3001\u7F16\u53F7\u8868\u548C\u7ED3\u6784\u6811\u91CC\u90FD\u627E\u4E0D\u5230\u76EE\u6807\u5143\u7D20\u3001\u6216\u4E0B\u4E00\u6B65\u53EA\u80FD\u662F\u91CD\u590D\u4E4B\u524D\u5DF2\u505A\u8FC7\u7684\u64CD\u4F5C\u3002args.question \u7B80\u8FF0\u56F0\u60D1\u70B9\u4E0E\u5DF2\u5C1D\u8BD5\u7684\u505A\u6CD5\uFF0C\u7528\u6237\u4F1A\u636E\u6B64\u7ED9\u51FA\u8865\u5145\u8BF4\u660E\u3001AI \u4FEE\u6B63\u3001\u624B\u52A8\u5B8C\u6210\u6216\u8DF3\u8FC7\u3002\u7CFB\u7EDF\u4E5F\u4F1A\u5728\u591A\u6B21\u89C6\u89C9\u89C2\u5BDF\u4ECD\u65E0\u8FDB\u5C55\u65F6\u81EA\u52A8\u6302\u8D77\u8BF7\u6C42\u4EBA\u5DE5\u534F\u52A9\u2014\u2014\u4E0E\u5176\u53CD\u590D\u622A\u56FE\u76F2\u627E\uFF0C\u4E0D\u5982\u5C3D\u65E9\u6C42\u52A9\u3002
10. \u63D0\u4EA4\u7C7B\u64CD\u4F5C\uFF08\u70B9\u51FB \u786E\u5B9A/\u63D0\u4EA4/\u4FDD\u5B58/\u53D1\u5E03\uFF09\u540E\u82E5\u5F39\u7A97\u672A\u5173\u95ED\u3001\u9875\u9762\u65E0\u53D8\u5316\u6216\u7ED3\u679C\u5F02\u5E38\uFF1A\u8C03\u7528 api \u5DE5\u5177\u67E5\u770B\u6700\u8FD1\u7684\u63A5\u53E3\u8BF7\u6C42/\u54CD\u5E94\uFF08\u72B6\u6001\u7801\u4E0E\u54CD\u5E94\u4F53\uFF09\uFF0C\u4EE5\u63A5\u53E3\u4E3A\u771F\u503C\u4E0E\u9875\u9762\u5B9E\u9645\u8868\u73B0\u4EA4\u53C9\u6838\u5BF9\uFF0C\u518D\u51B3\u5B9A\u4E0B\u4E00\u6B65\uFF0C\u4E0D\u8981\u76F2\u76EE\u91CD\u590D\u70B9\u51FB\u3002\u5206\u6D41\u53EA\u770B\u4E00\u6761\u6807\u51C6\u2014\u2014\u5931\u8D25\u539F\u56E0\u662F\u5426\u88AB\u9875\u9762\u660E\u786E\u544A\u77E5\u3001\u4E14\u53EF\u5F52\u56E0\u4E8E\u8F93\u5165\uFF1A
  \xB7 \u53EF\u5F52\u56E0\uFF08\u9875\u9762\u6709\u660E\u786E\u9519\u8BEF\u63D0\u793A/\u7EA2\u5B57\u6821\u9A8C\uFF0C\u4E14\u63A5\u53E3\u540C\u6837\u62A5\u9519\u3001\u6307\u5411\u53EF\u4FEE\u6B63\u7684\u8F93\u5165\u95EE\u9898\uFF09\u2192 \u6309\u53C2\u6570\u95EE\u9898\u6362\u503C\u91CD\u8BD5\uFF08revise \u914D\u5408\u89C1\u89C4\u5219 13\uFF09\u3002
  \xB7 \u4E0D\u53EF\u5F52\u56E0\uFF0C\u6216\u9875\u9762\u8868\u73B0\u4E0E\u63A5\u53E3\u771F\u503C\u4E92\u76F8\u77DB\u76FE\u2014\u2014\u7591\u4F3C\u88AB\u6D4B\u9875\u9762 Bug\uFF1A\u8C03\u7528 ask_human \u6C42\u52A9\uFF08question \u5199\u660E\u300C\u7591\u4F3C\u88AB\u6D4B\u9875\u9762 Bug\u300D\uFF0C\u9644\u4E0A\u67E5\u8BC1\u5230\u7684\u63A5\u53E3\u771F\u5B9E\u54CD\u5E94\u4E0E\u9875\u9762\u5B9E\u9645\u8868\u73B0\uFF09\uFF0C\u4E0D\u8981\u76F2\u76EE\u91CD\u8BD5\uFF0C\u4E5F\u4E0D\u8981\u4E3A\u8FC1\u5C31 Bug \u4FEE\u6539\u6D4B\u8BD5\u76EE\u6807\u3002\u77DB\u76FE\u5F62\u6001\u4E0D\u9650\u4E8E\u4EE5\u4E0B\u4F8B\u5B50\uFF1A
    - \u63A5\u53E3\u62A5\u9519\u4F46 UI \u88C5\u4F5C\u6210\u529F\uFF1A\u5F39\u7A97/\u8868\u5355\u7167\u5E38\u5173\u95ED\uFF0C\u65E0\u4EFB\u4F55\u9519\u8BEF\u63D0\u793A\uFF08UI \u541E\u6389\u5931\u8D25\uFF09\uFF1B
    - \u63A5\u53E3\u6210\u529F\u4F46\u9875\u9762\u672A\u5448\u73B0\u7ED3\u679C\uFF1A\u5217\u8868\u65E0\u65B0\u6761\u76EE\u3001\u6570\u636E\u672A\u53D8\u5316\uFF1B
    - \u9875\u9762\u62A5\u9519\u4F46\u63A5\u53E3\u5B9E\u9645\u6210\u529F\uFF1A\u51FA\u73B0\u9519\u8BEF\u63D0\u793A\u6216\u72B6\u6001\u56DE\u6EDA\uFF0C\u800C\u63A5\u53E3\u54CD\u5E94\u6B63\u5E38\u3001\u6570\u636E\u5DF2\u751F\u6548\uFF1B
    - \u65E0\u58F0\u5931\u8D25\uFF1A\u6210\u529F/\u5931\u8D25\u63D0\u793A\u7686\u65E0\uFF0C\u63A5\u53E3\u4E5F\u65E0\u5BF9\u5E94\u8BF7\u6C42\uFF08\u70B9\u51FB\u672A\u89E6\u53D1\u4EFB\u4F55\u8C03\u7528\uFF09\u6216\u54CD\u5E94\u65E0\u6CD5\u5224\u65AD\u6210\u8D25\u3002
11. \u5B8C\u6210\u6D4B\u8BD5\u610F\u56FE\u540E\uFF0C\u81F3\u5C11\u6DFB\u52A0\u4E00\u6761 assert \u65AD\u8A00\uFF08\u672B\u6B65\u5FC5\u987B\u662F\u65AD\u8A00\uFF09\uFF0C\u7136\u540E\u8C03\u7528 finish\u3002
12. \u73AF\u5883\u53D8\u91CF\u4EE5 {{key}} \u5360\u4F4D\u7B26\u5F15\u7528\uFF08fill \u7684 value \u91CC\u76F4\u63A5\u5199 {{key}}\uFF09\uFF0C\u4E0D\u8981\u5199\u6B7B\u771F\u5B9E\u503C\u3002
13. \u4FEE\u6B63\u540E\u91CD\u505A\u63D0\u4EA4\u65F6\uFF0C\u82E5\u65E7\u63D0\u4EA4/\u586B\u5199\u64CD\u4F5C\u5DF2\u843D\u5E93\u4E3A\u811A\u672C\u6B65\u9AA4\uFF0C\u914D\u5408\u8C03\u7528 revise \u6E05\u7406\uFF0C\u56DE\u653E\u811A\u672C\u5E94\u662F\u6700\u77ED\u6210\u529F\u8DEF\u5F84\u3002\u4E24\u7C7B\u573A\u666F\uFF1A\u2460 \u63D0\u4EA4\u5931\u8D25\u539F\u56E0\u662F\u53C2\u6570\u95EE\u9898\uFF08\u5982\u624B\u673A\u53F7\u91CD\u590D\u3001\u540D\u79F0\u5DF2\u5B58\u5728\u3001\u503C\u4E0D\u5408\u6CD5\uFF09\u9700\u6362\u503C\u91CD\u8BD5\u2014\u2014\u5148 revise \u6539 value\u3001\u5220\u9664\u5197\u4F59\u7684\u65E7\u503C\u63D0\u4EA4/\u91CD\u586B\u94FE\uFF0C\u518D\u6267\u884C\u4FEE\u6B63\u52A8\u4F5C\uFF1B\u2461 \u70B9\u51FB\u63D0\u4EA4\u540E\u5F39\u7A97\u672A\u5173\u3001\u88AB\u5FC5\u586B\u6821\u9A8C\u62E6\u622A\uFF08\u63D0\u4EA4\u672A\u751F\u6548\uFF09\u2014\u2014\u8865\u586B\u7F3A\u5931\u5B57\u6BB5\u91CD\u65B0\u63D0\u4EA4\uFF0C\u6210\u529F\u540E\u8C03\u7528 revise \u5220\u9664\u5148\u524D\u843D\u7A7A\u7684\u65E7\u63D0\u4EA4\u6B65\u3002\u4E0D\u8981\u7559\u4E0B\u300C\u6CE8\u5B9A\u5931\u8D25\u7684\u63D0\u4EA4 + \u91CD\u586B\u300D\u7684\u5197\u4F59\u94FE\u8DEF\u3002\u6240\u6709\u6210\u529F\u6267\u884C\u7684\u64CD\u4F5C\u90FD\u4F1A\u5982\u5B9E\u843D\u5E93\uFF08\u542B\u6709\u610F\u91CD\u590D\uFF0C\u5982\u5FAA\u73AF\u9020\u6570\u7684\u591A\u6B21\u586B\u5199\u540C\u4E00\u8F93\u5165\u6846\uFF09\u2014\u2014\u843D\u5E93\u6B65\u9AA4\u4E0E\u6D4F\u89C8\u5668\u5B9E\u9645\u6267\u884C\u4E00\u4E00\u5BF9\u5E94\uFF0C\u4E0D\u8981\u91CD\u590D\u6267\u884C\u5DF2\u6210\u529F\u4E14\u5DF2\u843D\u5E93\u7684\u64CD\u4F5C\uFF1B\u5931\u8D25\u91CD\u8BD5\u4EA7\u751F\u7684\u5197\u4F59\u94FE\u8BF7\u7528 revise \u6E05\u7406\uFF0Cfinish \u65F6\u7CFB\u7EDF\u8FD8\u4F1A\u505A\u4E00\u6B21\u5168\u5C40\u811A\u672C\u5BA1\u67E5\u515C\u5E95\u3002`;
function assertFailSig(args) {
  return `${String(args.type ?? "")}|${String(args.expected ?? "")}|${String(args.selector ?? "")}`;
}
function assistResultText(decision, errorText) {
  if (!decision) return `\u4EBA\u5DE5\u534F\u52A9\u8D85\u65F6\u672A\u54CD\u5E94\uFF1A${errorText}`;
  switch (decision.decision) {
    case "redescribe":
      return `\u3010\u7528\u6237\u8865\u5145\u8BF4\u660E\u3011${decision.instruction}
\u8BF7\u636E\u6B64\u91CD\u65B0\u5B8C\u6210\u76EE\u6807\uFF08\u53EF\u5148 snapshot \u786E\u8BA4\u5F53\u524D\u72B6\u6001\uFF09\u3002`;
    case "ai-fix":
      return "\u3010\u7528\u6237\u5F15\u5BFC\u3011\u7528\u6237\u9009\u62E9\u4E86 AI \u4FEE\u6B63\uFF1A\u8BF7\u91CD\u65B0 snapshot \u67E5\u770B\u5F53\u524D\u9875\u9762\uFF0C\u6362\u4E00\u79CD\u65B9\u5F0F\u5B8C\u6210\u521A\u624D\u5931\u8D25\u7684\u76EE\u6807\u3002";
    case "skip":
      return "\u3010\u7528\u6237\u5F15\u5BFC\u3011\u7528\u6237\u660E\u786E\u8981\u6C42\u8DF3\u8FC7\u8BE5\u76EE\u6807\u3002\u8BF7\u7EE7\u7EED\u5B8C\u6210\u6D4B\u8BD5\u610F\u56FE\u7684\u5176\u4F59\u90E8\u5206\uFF08\u4FDD\u6301\u672B\u6B65\u65AD\u8A00\uFF09\u3002";
    case "revoke":
      return `\u3010\u7528\u6237\u5F15\u5BFC\u3011\u7528\u6237\u5DF2\u64A4\u9500\u7B2C ${decision.from}~${decision.to} \u6B65\uFF0C\u8FD9\u4E9B\u6B65\u9AA4\u5DF2\u4ECE\u56DE\u653E\u811A\u672C\u4E2D\u5220\u9664\u3002\u8BF7\u5148 snapshot \u786E\u8BA4\u5F53\u524D\u9875\u9762\u72B6\u6001\uFF08\u88AB\u64A4\u9500\u6B65\u9AA4\u5728\u6D4F\u89C8\u5668\u91CC\u7684\u5B9E\u9645\u6548\u679C\u53EF\u80FD\u4ECD\u5728\uFF09\uFF0C${decision.nl ? `\u6309\u7528\u6237\u8865\u5145\u8BF4\u660E\u8C03\u6574\u505A\u6CD5\uFF1A${decision.nl}\u3002` : ""}\u91CD\u65B0\u5B8C\u6210\u8FD9\u90E8\u5206\u6D41\u7A0B\u2014\u2014\u6267\u884C\u6B63\u786E\u8DEF\u5F84\u5E76\u6B63\u5E38\u843D\u5E93\uFF0C\u4E0D\u8981\u91CD\u590D\u5DF2\u88AB\u64A4\u9500\u7684\u9519\u8BEF\u64CD\u4F5C\u3002`;
    default:
      return null;
  }
}
async function runScriptReview(o) {
  const { jobId, client } = o;
  if (o.steps.length < 4) return;
  const detail = o.steps.map((s, i) => {
    const label = s.kind === "assert" ? "\u65AD\u8A00" : s.action ?? s.kind;
    const loc = s.locator ? ` locator=${s.locator.strategy}:${s.locator.value}${s.locator.name ? `[${s.locator.name}]` : ""}` : "";
    const param = s.kind === "navigate" ? ` url=${s.url}` : s.value != null ? ` value=${s.value}` : s.key != null ? ` key=${s.key}` : s.assertion?.expected != null ? ` expected=${s.assertion.expected}` : "";
    return `${i + 1}. [${label}]${loc}${param} ${s.instruction}`;
  }).join("\n");
  try {
    const before = { ...getUsage(jobId) };
    const req = {
      model: o.model,
      messages: [
        {
          role: "system",
          content: '\u4F60\u662F\u56DE\u653E\u6D4B\u8BD5\u811A\u672C\u7684\u5BA1\u67E5\u5458\u3002\u5DF2\u843D\u6B65\u9AA4\u4E0E\u6D4F\u89C8\u5668\u5B9E\u9645\u6267\u884C\u4E00\u4E00\u5BF9\u5E94\u3002\u8BF7\u627E\u51FA\u300C\u5931\u8D25\u91CD\u8BD5/\u88AB\u540E\u7EED\u64CD\u4F5C\u66FF\u4EE3\u300D\u7684\u5197\u4F59\u6B65\u9AA4\u5E76\u6E05\u7406\uFF0C\u4F7F\u811A\u672C\u6210\u4E3A\u6700\u77ED\u6210\u529F\u56DE\u653E\u8DEF\u5F84\uFF1A\n- \u5220\u9664\uFF1A\u6CE8\u5B9A\u5931\u8D25\u6216\u5DF2\u843D\u7A7A\u7684\u64CD\u4F5C\u94FE\uFF08\u843D\u7A7A\u7684\u63D0\u4EA4\u3001\u65E7\u503C\u586B\u5199\u3001\u540C URL \u7684\u91CD\u590D\u5BFC\u822A\u7B49\uFF09\uFF1B\n- \u4FDD\u7559\uFF1A\u6709\u610F\u7684\u91CD\u590D\u64CD\u4F5C\uFF08\u5FAA\u73AF\u9020\u6570\u3001\u9010\u884C\u586B\u5199\u3001\u53CD\u590D\u5207\u6362\u7B49\uFF0C\u5373\u4F7F\u5143\u7D20\u4E0E\u503C\u5B8C\u5168\u76F8\u540C\uFF09\uFF1B\n- \u65AD\u8A00\u4E00\u822C\u4FDD\u7559\uFF1B\u552F\u4E00\u53EF\u5220\u4F8B\u5916\uFF1A\u4E24\u6761\u65AD\u8A00\u4E92\u4E3A\u5197\u4F59\uFF08\u540C\u4E00\u5B9A\u4F4D\u3001\u671F\u671B\u503C\u4E00\u65B9\u662F\u53E6\u4E00\u65B9\u7684\u524D\u7F00/\u5B50\u96C6\uFF0C\u5982\u6CDB\u5316 text=\u5BA2\u6237_ \u4E0E\u7CBE\u786E text=\u5BA2\u6237_1788703830578 \u5E76\u5B58\uFF0C\u4E0D\u8BBA\u8C01\u524D\u8C01\u540E\uFF09\uFF0C\u53EA\u5220\u5176\u4E2D\u4E00\u6761\u3001\u4FDD\u7559\u53E6\u4E00\u6761\uFF1B\u65E0\u8BBA\u5220\u5426\uFF0C\u5E94\u7528\u5168\u90E8 ops \u540E\u811A\u672C\u672B\u6B65\u5FC5\u987B\u662F\u65AD\u8A00\u2014\u2014\u82E5\u672B\u6B65\u65AD\u8A00\u4E0D\u5C5E\u4E8E\u5197\u4F59\u5BF9\uFF0C\u4EFB\u4F55\u5220\u9664\u90FD\u4E0D\u5F97\u89E6\u53CA\u5B83\uFF1B\n- \u4E0D\u786E\u5B9A\u65F6\u4FDD\u7559\uFF0C\u5B81\u591A\u52FF\u9519\u5220\uFF1B\u53EF\u7528 update \u4FEE\u6B63 value\uFF1Bops \u6309\u987A\u5E8F\u5E94\u7528\uFF0Cdelete \u4F1A\u4F7F\u4E4B\u540E\u7684\u539F\u5E8F\u53F7\u524D\u79FB\u2014\u2014\u8FDE\u7EED\u5220\u9664\u4E00\u6BB5\u8BF7\u5408\u5E76\u4E3A\u4E00\u4E2A\u8303\u56F4 op\uFF08from~to\uFF09\uFF0C\u5148\u5220\u540E\u6539\u65F6 update \u7684 step \u5E8F\u53F7\u6309\u5220\u9664\u540E\u7684\u65B0\u7F16\u53F7\u7ED9\u51FA\u3002\n\u8F93\u51FA JSON\uFF1A{"ops": [{"op":"delete","from":n,"to":m} \u6216 {"op":"update","step":n,"value":"\u65B0\u503C"}]}\uFF0Cops \u4E3A\u7A7A\u6570\u7EC4\u8868\u793A\u65E0\u9700\u4FEE\u8BA2\u3002\u53EA\u8F93\u51FA JSON\u3002'
        },
        { role: "user", content: `\u3010\u5DF2\u843D\u6B65\u9AA4\u3011
${detail}` }
      ],
      response_format: { type: "json_object" }
    };
    if (o.reasoningEffort) req.reasoning_effort = o.reasoningEffort;
    else {
      req.thinking = { type: "disabled" };
      req.temperature = 0;
    }
    const res = await client.chat.completions.create(req);
    const text = res.choices?.[0]?.message?.content ?? "";
    const usage = usageDelta(before, getUsage(jobId));
    const parsed = safeJsonParse2(stripFences(text));
    const ops = Array.isArray(parsed?.ops) ? parsed.ops : [];
    const reviewArgs = { reviewOutput: text, ops };
    if (ops.length) {
      const probe = applyReviseOps(o.steps, ops);
      if (typeof probe === "string") {
        pubToolWithUsage(jobId, 0, "\u811A\u672C\u5BA1\u67E5", `\u5BA1\u67E5 ${o.steps.length} \u6B65`, `\u5BA1\u67E5\u4EA7\u51FA\u4E0D\u5408\u89C4\uFF08${probe}\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u6E05\u7406`, usage, reviewArgs);
        return;
      }
      if (!probe.steps.length || probe.steps[probe.steps.length - 1].kind !== "assert") {
        pubToolWithUsage(jobId, 0, "\u811A\u672C\u5BA1\u67E5", `\u5BA1\u67E5 ${o.steps.length} \u6B65`, "\u5BA1\u67E5\u4EA7\u51FA\u4E0D\u5408\u89C4\uFF08\u5E94\u7528\u540E\u672B\u6B65\u4E0D\u518D\u662F\u65AD\u8A00\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u6E05\u7406", usage, reviewArgs);
        return;
      }
      const n = o.steps.length;
      const summary = await o.revise(ops);
      pubToolWithUsage(jobId, 0, "\u811A\u672C\u5BA1\u67E5", `\u5BA1\u67E5 ${n} \u6B65`, summary, usage, reviewArgs);
    } else {
      pubToolWithUsage(jobId, 0, "\u811A\u672C\u5BA1\u67E5", `\u5BA1\u67E5 ${o.steps.length} \u6B65`, "\u5BA1\u67E5\u901A\u8FC7\uFF1A\u65E0\u5197\u4F59\u6B65\u9AA4\u9700\u8981\u6E05\u7406", usage, reviewArgs);
    }
  } catch (e) {
    console.warn(`[gen:${jobId}] \u811A\u672C\u5BA1\u67E5\u5931\u8D25\uFF0C\u8DF3\u8FC7\u6E05\u7406\uFF1A`, e);
  }
}
async function runGenerationLoop(o) {
  const { jobId, pwPage, page, client, cfg } = o;
  const pluginActions = await enabledActionVocabulary(o.projectId ?? null);
  const network = new NetworkCapture();
  network.attach(pwPage);
  revokeHandlers.set(jobId, (from, to) => revokeStepRange(o.baseSteps ? [o.baseSteps, o.steps] : [o.steps], from, to));
  let assertSeq = o.outlineAssertBase ?? 0;
  const emitWithOutlineWaits = async (step) => {
    if (step.kind === "assert") {
      const outlineAsserts = o.outline.map((s, i) => s.kind === "assert" ? i : -1).filter((i) => i >= 0);
      if (assertSeq < outlineAsserts.length) {
        const lo = assertSeq > 0 ? outlineAsserts[assertSeq - 1] + 1 : 0;
        const hi = outlineAsserts[assertSeq];
        for (const w of o.outline.slice(lo, hi).filter((s) => s.kind === "action" && s.action === "wait")) {
          const ms = Math.max(0, Number(w.value) || 1e3);
          await o.emit({ kind: "wait", action: "wait", value: String(ms), instruction: w.instruction, description: w.instruction });
        }
      }
      assertSeq++;
    }
    await o.emit(step);
  };
  const emitAbsorbingProbe = async (step) => {
    const removedAt = absorbProbeClick(o.steps, step);
    if (removedAt != null) {
      pub({ type: "gen:revise", jobId, base: o.baseSteps?.length ?? 0, steps: o.steps, ops: [{ op: "delete", from: removedAt, to: removedAt }] });
    }
    await emitWithOutlineWaits(step);
  };
  const emitStep = async (step) => {
    normalizeStepSystemVars(step);
    await emitAbsorbingProbe(step);
    return { index: o.steps.length };
  };
  const revise = async (ops) => {
    for (const op of ops) {
      if (op?.op !== "update") continue;
      if (op.value != null) op.value = legacyToUnifiedSystemVars(String(op.value));
      if (op.instruction != null) op.instruction = legacyToUnifiedSystemVars(String(op.instruction));
      if (op.expected != null) op.expected = legacyToUnifiedSystemVars(String(op.expected));
    }
    const applied = applyReviseOps(o.steps, ops);
    if (typeof applied === "string") throw new Error(applied);
    o.steps.splice(0, o.steps.length, ...applied.steps);
    pub({ type: "gen:revise", jobId, base: o.baseSteps?.length ?? 0, steps: o.steps, ops });
    const lines = applied.steps.slice(0, 60).map((s, i) => `${i + 1}. [${s.kind === "assert" ? "\u65AD\u8A00" : s.action ?? s.kind}] ${String(s.instruction ?? "").slice(0, 60)}`);
    return `\u5DF2\u4FEE\u8BA2\u811A\u672C\u6B65\u9AA4\uFF08\u66F4\u65B0 ${applied.updated} \u6B65\u3001\u5220\u9664 ${applied.deleted} \u6B65\uFF09\u3002\u5F53\u524D\u5DF2\u843D\u6B65\u9AA4\uFF1A
${lines.join("\n")}`;
  };
  const ctx = {
    jobId,
    page,
    stagehand: o.stagehand,
    pwPage,
    client,
    model: cfg.openaiModel,
    xpathMap: {},
    sub: o.sub,
    envMap: o.envMap,
    emit: emitStep,
    onTool: (index, label, detail, result) => pubToolWithUsage(jobId, index, label, detail, result, { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 }),
    note: () => {
    },
    stepCount: () => o.steps.length,
    revise,
    usageKey: jobId,
    modelVision: o.modelVision,
    pluginActions,
    network
  };
  const manualCapture = createManualCapture({ jobId, pwPage, emit: emitStep, isCancelled: o.isCancelled });
  const assistFollowup = async (decision, context) => {
    if (decision?.decision === "manual") return manualCapture(context);
    return assistResultText(decision, context);
  };
  let scriptReviewed = false;
  const reviewScriptSteps = async () => {
    if (scriptReviewed) return;
    scriptReviewed = true;
    await runScriptReview({ jobId, client, model: cfg.openaiModel, reasoningEffort: cfg.reasoningEffort, steps: o.steps, revise });
  };
  const finishValidate = async () => {
    const last = o.steps[o.steps.length - 1];
    if (!last || last.kind !== "assert") {
      return "\u811A\u672C\u5FC5\u987B\u4EE5\u65AD\u8A00\u6B65\u9AA4\u7ED3\u5C3E\uFF08\u9A8C\u8BC1\u6D4B\u8BD5\u7ED3\u679C\uFF09\u3002\u8BF7\u5148\u8C03\u7528 assert \u5DE5\u5177\u6DFB\u52A0\u65AD\u8A00\uFF0C\u518D\u8C03\u7528 finish\u3002";
    }
    await reviewScriptSteps();
    return null;
  };
  const askHuman = async (question) => {
    const context = `Agent \u4E3B\u52A8\u6C42\u52A9\uFF1A${question.slice(0, 200)}`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: "tool",
      instruction: context,
      canManual: true
    });
    if (o.isCancelled()) return "\uFF08\u751F\u6210\u5DF2\u53D6\u6D88\uFF09";
    return await assistFollowup(decision, context) ?? "\u7528\u6237\u672A\u7ED9\u51FA\u6709\u6548\u51B3\u7B56\uFF0C\u8BF7\u81EA\u884C\u51B3\u5B9A\u4E0B\u4E00\u6B65\uFF08\u6362\u8DEF\u5F84\u3001\u8DF3\u8FC7\u8BE5\u9879\u6216\u5982\u5B9E finish\uFF09\u3002";
  };
  const tools = buildGenTools(ctx, finishValidate, askHuman);
  const outlineText = o.outline.length ? o.outline.map((s, i) => `${i + 1}. [${s.kind === "assert" ? "\u65AD\u8A00" : s.action ?? "\u64CD\u4F5C"}] ${s.instruction}`).join("\n") : "\uFF08\u7528\u6237\u672A\u786E\u8BA4\u5177\u4F53\u5927\u7EB2\uFF0C\u8BF7\u81EA\u884C\u89C4\u5212\u6B65\u9AA4\uFF09";
  const pluginHint = pluginActions.length ? `

\u3010\u53EF\u7528\u7EC4\u4EF6\u8BED\u4E49\u52A8\u4F5C\u3011
${pluginActions.map((v) => `- ${v.name}\uFF1A${v.doc ?? ""}`).join("\n")}` : "";
  const messages = o.resumeMessages ?? [
    { role: "system", content: `${GEN_LOOP_SYSTEM_PROMPT}${pluginHint}${o.envVarHint ? `

${o.envVarHint}` : ""}` },
    {
      role: "user",
      content: `\u3010\u6D4B\u8BD5\u76EE\u6807\u3011
${o.goalText}

\u3010\u53C2\u8003\u5927\u7EB2\uFF08\u8F6F\u7EA6\u675F\uFF1A\u6309\u5B9E\u9645\u60C5\u51B5\u6267\u884C\uFF0C\u5141\u8BB8\u5408\u7406\u504F\u79BB\uFF1B\u4E0D\u8981\u7167\u6284\u5927\u7EB2\u6587\u672C\u5F53\u4F5C\u64CD\u4F5C\uFF09\u3011
${outlineText}`
    }
  ];
  let failStreak = 0;
  const onSuccess = (name) => {
    if (!GEN_OBSERVATION_TOOLS.has(name)) failStreak = 0;
  };
  const assertFailTotal = /* @__PURE__ */ new Map();
  const onAssertFail = async (args, error) => {
    const sig = assertFailSig(args);
    const total = (assertFailTotal.get(sig) ?? 0) + 1;
    assertFailTotal.set(sig, total);
    if (total < ASSERT_FAIL_ASSIST_AT) return null;
    assertFailTotal.set(sig, 0);
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: "assert",
      instruction: `\u65AD\u8A00\u540C\u76EE\u6807\u5DF2\u5931\u8D25 ${ASSERT_FAIL_ASSIST_AT} \u6B21\uFF1A${String(args.instruction ?? sig).slice(0, 200)}`,
      canManual: false
    });
    if (o.isCancelled()) return null;
    return assistResultText(decision, String(error).slice(0, 200));
  };
  const onFailure = async (name, args, error) => {
    if (name === "assert") return onAssertFail(args, error);
    failStreak++;
    if (failStreak < MAX_ASSIST_PER_STEP) return null;
    failStreak = 0;
    const context = `\u5DE5\u5177\u300C${name}\u300D\u8FDE\u7EED\u5931\u8D25\uFF1A${String(error).slice(0, 200)}`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: "tool",
      instruction: context,
      canManual: true
    });
    if (o.isCancelled()) return null;
    return assistFollowup(decision, context);
  };
  const onStuck = async (name, args, count, kind, detail) => {
    const context = kind === "observe" ? `\u8FDE\u7EED ${count} \u6B21\u89C6\u89C9\u89C2\u5BDF\u65E0\u8FDB\u5C55` : kind === "linkage" ? `\u7591\u4F3C\u8054\u52A8\u5B57\u6BB5\u7684\u7EC4\u5408\u5DF2\u4EA4\u66FF\u91CD\u8BD5 ${count} \u8F6E` : `\u76F8\u540C\u64CD\u4F5C\u5DF2\u91CD\u590D ${count} \u6B21\u65E0\u8FDB\u5C55`;
    const decision = await askUser(jobId, {
      stepIndex: o.steps.length,
      kind: "tool",
      instruction: kind === "observe" ? `\u89C2\u5BDF\u7A7A\u8F6C\u4FDD\u62A4\uFF1A\u5DF2\u8FDE\u7EED ${count} \u6B21\u89C6\u89C9\u89C2\u5BDF\uFF08see\uFF09\u4ECD\u65E0\u8FDB\u5C55\uFF0C\u7591\u4F3C\u627E\u4E0D\u5230\u76EE\u6807\u5165\u53E3` : kind === "linkage" ? `\u8054\u52A8\u6B7B\u9501\u4FDD\u62A4\uFF1A${detail ?? "\u4E24\u4E2A\u4E0B\u62C9\u5B57\u6BB5"}\u5DF2\u4EA4\u66FF\u6210\u529F\u9009\u62E9 ${count} \u8F6E\uFF0C\u9009\u62E9\u5176\u4E00\u540E\u53E6\u4E00\u4E2A\u88AB\u9875\u9762\u56DE\u8BBE\uFF0C\u7591\u4F3C\u8054\u52A8\u5B57\u6BB5\uFF08\u5F53\u524D\u7EC4\u5408\u4E0D\u88AB\u9875\u9762\u63A5\u53D7\uFF09` : `\u7A7A\u8F6C\u4FDD\u62A4\uFF1A\u5DE5\u5177\u300C${name}\u300D\u76F8\u540C\u64CD\u4F5C\u5DF2\u91CD\u590D ${count} \u6B21\u65E0\u8FDB\u5C55`,
      canManual: true
    });
    if (o.isCancelled()) return null;
    return assistFollowup(decision, context);
  };
  let lastStepCount = ctx.stepCount();
  const isProgress = (name) => {
    const cur = ctx.stepCount();
    if (cur > lastStepCount) {
      lastStepCount = cur;
      return true;
    }
    return name === "goto";
  };
  const loop = await runToolLoop({
    client,
    model: cfg.openaiModel,
    reasoningEffort: cfg.reasoningEffort,
    tools,
    messages,
    maxSteps: Math.max(20, cfg.maxSteps ?? 200),
    usageKey: jobId,
    signal: o.signal,
    // toolLoop 的 finish 是特殊分支（不执行 finish 工具的 execute），校验必须经此传入：
    // 末步断言校验 + finish 时全局脚本审查（reviewScriptSteps）都挂在这里
    validateFinish: finishValidate,
    onFailure,
    onSuccess,
    onStuck,
    isProgress,
    onStep: ({ index, name, args, result, usageDelta: ud }) => {
      const label = { snapshot: "\u5FEB\u7167", page_tree: "\u7ED3\u6784\u6811", goto: "\u5BFC\u822A", click: "\u70B9\u51FB", fill: "\u586B\u5199", press: "\u6309\u952E", check: "\u52FE\u9009", select: "\u9009\u62E9", wait: "\u7B49\u5F85", readText: "\u8BFB\u53D6\u6587\u672C", assert: "\u65AD\u8A00", act: "AI \u515C\u5E95", see: "\u89C6\u89C9\u89C2\u5BDF", api: "\u7F51\u7EDC\u8BF7\u6C42", component_action: "\u7EC4\u4EF6\u52A8\u4F5C", ask_human: "\u4EBA\u5DE5\u6C42\u52A9", finish: "\u5B8C\u6210" }[name] ?? name;
      let detail = "";
      try {
        detail = JSON.stringify(args ?? {}).slice(0, 160);
      } catch {
        detail = "";
      }
      pubToolWithUsage(jobId, index, label, detail, result, ud, name === "see" ? args : void 0);
    },
    // see 截图的「模型作答」在下一轮 completion 到达（toolLoop 回调），回填对应 GenerationStep.assistant
    onAssistantContent: (stepIndex, content) => updateToolAssistant(jobId, stepIndex, content)
  }).finally(() => {
    revokeHandlers.delete(jobId);
    network.dispose();
  });
  if (o.isCancelled()) return { ok: false, messages };
  if (!loop.finished) {
    if (!o.isCancelled()) pub({ type: "gen:error", jobId, message: `\u751F\u6210\u5FAA\u73AF\u672A\u6B63\u5E38\u6536\u655B\uFF08${loop.steps} \u4E2A\u5DE5\u5177\u6B65\u9AA4\uFF09\uFF1A${loop.finishMessage ?? "\u672A\u8C03\u7528 finish"}`, usage: getUsage(jobId) });
    return { ok: false, finishMessage: loop.finishMessage, messages };
  }
  return { ok: true, finishMessage: loop.finishMessage, messages };
}

// src/services/generationService.ts
async function generate(jobId, params) {
  if (!isConfigured()) {
    pub({ type: "gen:error", jobId, message: "\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u4E2D\u914D\u7F6E\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5" });
    return;
  }
  const cfg = getConfig();
  initUsage(jobId);
  const logId = await upsertLog(jobId, {
    projectId: params.projectId ?? null,
    testCaseId: params.testCaseId ?? null,
    nl: params.nl ?? "",
    startUrl: params.startUrl ?? null,
    status: "RUNNING"
  });
  if (logId) activeLogIds.set(jobId, logId);
  if (logId) {
    appendStep(logId, {
      type: STEP_TYPE.USER_INPUT,
      message: params.nl ?? "",
      args: {
        startUrl: params.startUrl ?? null,
        attachments: params.attachments ?? [],
        loginConfigId: params.loginConfigId ?? null,
        projectId: params.projectId ?? null,
        testCaseId: params.testCaseId ?? null
      }
    });
  }
  const job = createJobRuntime(jobId);
  const { abortCtrl } = job;
  try {
    const envMap = params.envMap ?? {};
    const envVarHint = buildEnvVarHint(envMap);
    const modelVision = cfg.openaiModelVision;
    const att = loadGenAttachments(jobId, params.attachments ?? []);
    if (!att) return;
    const { text: attachmentText, images: attachmentImages } = att;
    let stagehand;
    let pwBrowser = null;
    let pwPage = null;
    const viewport = await loadProjectViewport(params.projectId);
    if (viewport) pub({ type: "gen:status", jobId, message: `[\u6D4F\u89C8\u5668\u7A97\u53E3] \u6309\u9879\u76EE\u914D\u7F6E\u4F7F\u7528 ${viewport.width}\xD7${viewport.height}` });
    try {
      if (params.loginConfigId) {
        const login = await loadLoginStorageState(params.loginConfigId);
        pub({ type: "gen:status", jobId, message: login.ok ? `[\u767B\u5F55\u914D\u7F6E] \u5DF2\u52A0\u8F7D\u300C${login.name}\u300D\uFF0C\u4EE5\u5DF2\u767B\u5F55\u72B6\u6001\u751F\u6210` : `[\u767B\u5F55\u914D\u7F6E] ${login.name}\uFF0C\u4EE5\u672A\u767B\u5F55\u72B6\u6001\u751F\u6210` });
        stagehand = login.ok ? await createSessionWithStorageState(jobId, login.storageState, viewport) : await createSession(jobId, { viewport });
      } else {
        stagehand = await createSession(jobId, { viewport });
      }
    } catch (e) {
      if (job.isCancelled()) return;
      pub({ type: "gen:error", jobId, message: `\u542F\u52A8\u6D4F\u89C8\u5668\u5931\u8D25\uFF1A${friendlyBrowserLaunchError(e)}`, usage: getUsage(jobId) });
      return;
    }
    onSessionBrowserClosed(jobId, () => job.cancel("\u6D4F\u89C8\u5668\u5DF2\u88AB\u5173\u95ED\uFF0C\u751F\u6210\u5DF2\u53D6\u6D88"));
    const steps = [];
    const { sub: sub2 } = createSubstituter(envMap, Date.now());
    const emit = createStepEmitter(jobId, steps, () => 0);
    try {
      const page = await sessionPage(stagehand);
      if (!page) throw new Error("\u6D4F\u89C8\u5668\u9875\u9762\u4E0D\u53EF\u7528");
      const setup = await setupGenPage(jobId, page, params.projectId);
      if (setup.error) {
        if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: setup.error, usage: getUsage(jobId) });
        return;
      }
      pwBrowser = setup.pwBrowser;
      pwPage = setup.pwPage;
      if (params.startUrl) {
        const realUrl = sub2(params.startUrl) ?? params.startUrl;
        await page.goto(realUrl);
        await emit({ kind: "navigate", action: "goto", url: params.startUrl, instruction: "\u6253\u5F00\u8D77\u59CB\u9875", description: "\u6253\u5F00\u8D77\u59CB\u9875" });
        pub({ type: "gen:tool", jobId, index: 1, step: { actionLabel: "goto", actionDetail: `url=${params.startUrl}`, result: `\u5DF2\u5BFC\u822A\u5230 ${await page.url()}` } });
      }
      const client = createGatewayClient(jobId);
      let pageCtx = "";
      if (params.startUrl) {
        try {
          pageCtx = `

\u3010\u5F53\u524D\u9875\u9762\u3011\u6807\u9898\uFF1A${await page.title() || "(\u65E0\u6807\u9898)"}\uFF1BURL\uFF1A${await page.url()}`;
        } catch {
        }
      }
      const systemContent = cfg.splitSystemPrompt || DEFAULT_SPLIT_SYSTEM_PROMPT;
      const userContent = `\u3010\u6D4B\u8BD5\u76EE\u6807\u3011
${params.nl}${attachmentText}${params.startUrl ? `

\u8D77\u59CB\u5730\u5740\uFF1A${params.startUrl}` : ""}${pageCtx}`;
      const split = await preSplit(client, cfg.openaiModel, await splitSystemWithVocab(systemContent, params.projectId), userContent, envVarHint, cfg.reasoningEffort, logId, jobId, attachmentImages);
      if (job.isCancelled()) return;
      const plan = split.steps;
      if (!plan || !plan.length) {
        pub({ type: "gen:error", jobId, message: "\u9884\u62C6\u5206\u672A\u5F97\u5230\u6709\u6548\u6B65\u9AA4\uFF0C\u8BF7\u8865\u5145\u66F4\u8BE6\u7EC6\u7684\u63CF\u8FF0\u540E\u91CD\u8BD5", usage: getUsage(jobId) });
        return;
      }
      const confirmed = await awaitPlanConfirm(jobId, plan, split.usage);
      if (job.isCancelled()) return;
      if (!confirmed || !confirmed.length) {
        if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: "\u672A\u6536\u5230\u8BA1\u5212\u786E\u8BA4\u6216\u7B49\u5F85\u8D85\u65F6", usage: getUsage(jobId) });
        return;
      }
      pub({ type: "gen:status", jobId, message: `\u5927\u7EB2\u5DF2\u786E\u8BA4\uFF08${confirmed.length} \u6B65\u53C2\u8003\uFF09\uFF0C\u5F00\u59CB\u667A\u80FD\u4F53\u751F\u6210\u2026` });
      const loopResult = await runGenerationLoop({
        jobId,
        page,
        stagehand,
        pwPage,
        client,
        cfg,
        modelVision,
        envMap,
        envVarHint,
        sub: sub2,
        emit,
        steps,
        goalText: `${params.nl}${attachmentText}${params.startUrl ? `
\u8D77\u59CB\u5730\u5740\uFF1A${params.startUrl}` : ""}`,
        outline: confirmed,
        projectId: params.projectId ?? null,
        logId,
        isCancelled: job.isCancelled,
        signal: abortCtrl.signal
      });
      if (job.isPaused() && loopResult.messages.length) {
        await prisma.generationLog.update({
          where: { jobId },
          data: {
            loopState: {
              messages: loopResult.messages,
              goalText: `${params.nl}${attachmentText}`,
              envVarHint,
              outline: confirmed,
              projectId: params.projectId ?? null
            }
          }
        }).catch(() => {
        });
      }
      if (job.isCancelled()) return;
      if (!loopResult.ok) return;
      if (job.isCancelled()) return;
      if (!steps.length) {
        pub({ type: "gen:error", jobId, message: "\u672A\u751F\u6210\u4EFB\u4F55\u6B65\u9AA4", usage: getUsage(jobId) });
        return;
      }
      const script = { name: "\u751F\u6210\u811A\u672C", steps };
      pub({ type: "gen:done", jobId, script, usage: getUsage(jobId) });
    } catch (e) {
      if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: `\u6267\u884C\u5931\u8D25\uFF1A${String(e)}`, usage: getUsage(jobId) });
    } finally {
      await finalizeGenJob(jobId, { paused: job.isPaused(), pwBrowser, logId });
    }
  } finally {
    releaseJob(jobId, job.isPaused());
  }
}
async function continueGenerate(jobId, params) {
  if (!isConfigured()) {
    pub({ type: "gen:error", jobId, message: "\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u4E2D\u914D\u7F6E\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5" });
    return;
  }
  const stagehand = getSession(jobId);
  if (!stagehand) {
    pub({ type: "gen:error", jobId, message: "\u6D4F\u89C8\u5668\u4F1A\u8BDD\u5DF2\u5173\u95ED\uFF08\u6682\u505C\u8D85\u8FC7 30 \u5206\u949F\u6216\u670D\u52A1\u5DF2\u91CD\u542F\uFF09\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u811A\u672C" });
    return;
  }
  cancelSessionGc(jobId);
  const cfg = getConfig();
  ensureUsage(jobId);
  const continueLogId = await upsertLog(jobId, {
    projectId: params.projectId ?? null,
    testCaseId: params.testCaseId ?? null,
    nl: params.nl ?? "",
    status: "RUNNING"
  });
  if (continueLogId) activeLogIds.set(jobId, continueLogId);
  if (continueLogId) {
    appendStep(continueLogId, {
      type: STEP_TYPE.USER_INPUT,
      message: `[\u7EE7\u7EED] ${params.nl ?? ""}`,
      args: { attachments: params.attachments ?? [], baseStepCount: params.baseSteps?.length ?? 0 }
    });
  }
  let pwBrowser = null;
  let pwPage = null;
  const job = createJobRuntime(jobId);
  const { abortCtrl } = job;
  onSessionBrowserClosed(jobId, () => job.cancel("\u6D4F\u89C8\u5668\u5DF2\u88AB\u5173\u95ED\uFF0C\u751F\u6210\u5DF2\u53D6\u6D88"));
  try {
    const envMap = params.envMap ?? {};
    const envVarHint = buildEnvVarHint(envMap);
    const att = loadGenAttachments(jobId, params.attachments ?? []);
    if (!att) return;
    const { text: attachmentText, images: attachmentImages } = att;
    const page = await sessionPage(stagehand);
    if (!page) throw new Error("\u6D4F\u89C8\u5668\u9875\u9762\u4E0D\u53EF\u7528");
    const setup = await setupGenPage(jobId, page, params.projectId);
    if (setup.error) {
      if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: setup.error, usage: getUsage(jobId) });
      return;
    }
    pwBrowser = setup.pwBrowser;
    pwPage = setup.pwPage;
    const steps = [];
    const { sub: sub2 } = createSubstituter(envMap, Date.now());
    const emit = createStepEmitter(jobId, steps, () => params.baseSteps.length);
    try {
      let title = "";
      let url = "";
      try {
        title = await page.title() || "(\u65E0\u6807\u9898)";
        url = await page.url();
      } catch {
      }
      const client = createGatewayClient(jobId);
      if (params.resumeLoop) {
        const saved = await prisma.generationLog.findUnique({ where: { jobId }, select: { loopState: true } });
        const st = saved?.loopState;
        if (st?.messages?.length) {
          const resumeResult = await runGenerationLoop({
            jobId,
            page,
            stagehand,
            pwPage,
            client,
            cfg,
            modelVision: cfg.openaiModelVision,
            envMap,
            envVarHint,
            sub: sub2,
            emit,
            steps,
            goalText: String(st.goalText ?? params.nl),
            outline: Array.isArray(st.outline) ? st.outline : [],
            // 续跑的大纲是完整原大纲，baseSteps 里已落库的断言计入对齐基数，避免等待步重复补插
            outlineAssertBase: params.baseSteps.filter((s) => s.kind === "assert").length,
            baseSteps: params.baseSteps,
            projectId: params.projectId ?? null,
            logId: continueLogId,
            isCancelled: job.isCancelled,
            signal: abortCtrl.signal,
            resumeMessages: st.messages
          });
          if (job.isCancelled()) return;
          if (!resumeResult.ok) return;
          const script2 = { name: "\u751F\u6210\u811A\u672C", steps: [...params.baseSteps, ...steps] };
          pub({ type: "gen:done", jobId, script: script2, usage: getUsage(jobId) });
          return;
        }
        pub({ type: "gen:status", jobId, message: "\u65E0\u53EF\u7EED\u8DD1\u7684\u5FAA\u73AF\u72B6\u6001\uFF0C\u6539\u4E3A\u5E38\u89C4\u7EE7\u7EED\u751F\u6210" });
      }
      const doneSummary = params.baseSteps.map((s, i) => `${i + 1}. [${s.kind === "assert" ? "\u65AD\u8A00" : s.action ?? s.kind}] ${s.instruction ?? s.description ?? ""}`).join("\n");
      const systemContent = cfg.splitSystemPrompt || DEFAULT_SPLIT_SYSTEM_PROMPT;
      const userContent = `\u3010\u6A21\u5F0F\u3011\u7EE7\u7EED\u751F\u6210\u3002\u8FD9\u662F\u4E00\u6B21\u88AB\u4E2D\u9014\u6682\u505C\u7684\u6D4B\u8BD5\uFF0C\u6D4F\u89C8\u5668\u505C\u7559\u5728\u5F53\u524D\u9875\u9762\u3002\u5DF2\u5B8C\u6210\u6B65\u9AA4\u4FDD\u7559\u4E0D\u52A8\uFF0C\u8BF7\u53EA\u4E3A\u300C\u4ECE\u5F53\u524D\u9875\u9762\u72B6\u6001\u7EE7\u7EED\u300D\u7684\u5269\u4F59\u6D41\u7A0B\u62C6\u5206\u6B65\u9AA4\uFF1A\u4E0D\u8981\u91CD\u590D\u5DF2\u5B8C\u6210\u6B65\u9AA4\uFF0C\u4E0D\u8981\u8F93\u51FA\u56DE\u5230\u8D77\u59CB\u9875\u7684 goto\uFF0C\u8BA1\u5212\u4ECD\u5FC5\u987B\u4EE5\u4E00\u6761\u65AD\u8A00\u6B65\u9AA4\u7ED3\u5C3E\u3002

\u3010\u8FFD\u52A0\u76EE\u6807\u3011
${params.nl}${attachmentText}

\u3010\u5DF2\u5B8C\u6210\u6B65\u9AA4\u3011
${doneSummary || "\uFF08\u65E0\uFF09"}

\u3010\u5F53\u524D\u9875\u9762\u3011\u6807\u9898\uFF1A${title}\uFF1BURL\uFF1A${url}`;
      const split = await preSplit(client, cfg.openaiModel, await splitSystemWithVocab(systemContent, params.projectId), userContent, envVarHint, cfg.reasoningEffort, continueLogId, jobId, attachmentImages);
      if (job.isCancelled()) return;
      const plan = split.steps;
      if (!plan || !plan.length) {
        pub({ type: "gen:error", jobId, message: "\u8FFD\u52A0\u62C6\u5206\u672A\u5F97\u5230\u6709\u6548\u6B65\u9AA4\uFF0C\u8BF7\u8865\u5145\u66F4\u8BE6\u7EC6\u7684\u63CF\u8FF0\u540E\u91CD\u8BD5", usage: getUsage(jobId) });
        return;
      }
      const confirmed = await awaitPlanConfirm(jobId, plan, split.usage);
      if (job.isCancelled()) return;
      if (!confirmed || !confirmed.length) {
        if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: "\u672A\u6536\u5230\u8BA1\u5212\u786E\u8BA4\u6216\u7B49\u5F85\u8D85\u65F6", usage: getUsage(jobId) });
        return;
      }
      pub({ type: "gen:status", jobId, message: `\u5927\u7EB2\u5DF2\u786E\u8BA4\uFF08${confirmed.length} \u6B65\u53C2\u8003\uFF09\uFF0C\u7EE7\u7EED\u667A\u80FD\u4F53\u751F\u6210\u2026` });
      const loopResult = await runGenerationLoop({
        jobId,
        page,
        stagehand,
        pwPage,
        client,
        cfg,
        modelVision: cfg.openaiModelVision,
        envMap,
        envVarHint,
        sub: sub2,
        emit,
        steps,
        goalText: `\u3010\u8FFD\u52A0\u76EE\u6807\u3011${params.nl}${attachmentText}`,
        outline: confirmed,
        baseSteps: params.baseSteps,
        projectId: params.projectId ?? null,
        logId: continueLogId,
        isCancelled: job.isCancelled,
        signal: abortCtrl.signal
      });
      if (job.isCancelled()) return;
      if (!loopResult.ok) return;
      if (job.isCancelled()) return;
      if (!steps.length) {
        pub({ type: "gen:error", jobId, message: "\u672A\u751F\u6210\u4EFB\u4F55\u65B0\u6B65\u9AA4", usage: getUsage(jobId) });
        return;
      }
      const script = { name: "\u751F\u6210\u811A\u672C", steps: [...params.baseSteps, ...steps] };
      pub({ type: "gen:done", jobId, script, usage: getUsage(jobId) });
    } catch (e) {
      if (!job.isCancelled()) pub({ type: "gen:error", jobId, message: `\u6267\u884C\u5931\u8D25\uFF1A${String(e)}`, usage: getUsage(jobId) });
    } finally {
      await finalizeGenJob(jobId, { paused: job.isPaused(), pwBrowser, logId: continueLogId });
    }
  } finally {
    releaseJob(jobId, job.isPaused());
  }
}

// src/routes/generate.ts
async function generateRoutes(app2) {
  app2.post("/api/generate", async (req) => {
    const { nl, startUrl, projectId, testCaseId, loginConfigId, attachments } = req.body ?? {};
    if (!nl) return { error: "\u7F3A\u5C11\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0" };
    if (!isConfigured()) return { error: "\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u4E2D\u914D\u7F6E\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5" };
    const envMap = {};
    if (projectId) {
      const vars = await prisma.envVar.findMany({ where: { projectId }, select: { key: true, value: true } });
      for (const v of vars) envMap[v.key] = v.value;
    }
    const jobId = randomUUID3();
    generate(jobId, { nl, startUrl, envMap, loginConfigId, attachments: attachments ?? [], projectId: projectId ?? null, testCaseId: testCaseId ?? null }).catch(
      (e) => publish({ type: "gen:error", jobId, message: String(e) })
    );
    return { jobId };
  });
  app2.post("/api/generate/:jobId/confirm", async (req) => {
    const { jobId } = req.params;
    const { steps } = req.body ?? {};
    if (!Array.isArray(steps) || !steps.length || !steps.every((s) => s && typeof s.instruction === "string" && s.instruction.trim())) {
      return { error: "\u7F3A\u5C11\u6709\u6548\u7684\u6B65\u9AA4\u5217\u8868" };
    }
    const ok = confirmPlan(jobId, steps);
    if (!ok) return { error: "\u8BE5\u4EFB\u52A1\u4E0D\u5728\u7B49\u5F85\u8BA1\u5212\u786E\u8BA4\u72B6\u6001" };
    return { ok: true };
  });
  app2.post("/api/generate/:jobId/assist", async (req) => {
    const { jobId } = req.params;
    const { decision, instruction, from, to, nl } = req.body ?? {};
    if (!decision || !["redescribe", "ai-fix", "manual", "skip", "revoke"].includes(decision)) return { error: "\u672A\u77E5\u51B3\u7B56" };
    let d;
    if (decision === "redescribe") {
      d = { decision: "redescribe", instruction: String(instruction ?? "") };
    } else if (decision === "revoke") {
      const f = Number(from);
      const t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < f) return { error: "\u64A4\u9500\u8303\u56F4\u65E0\u6548" };
      d = { decision: "revoke", from: f, to: t, nl: nl ? String(nl) : void 0 };
    } else {
      d = { decision };
    }
    const r = assistStep(jobId, d);
    if (r !== true) return { error: typeof r === "string" ? r : "\u8BE5\u4EFB\u52A1\u4E0D\u5728\u7B49\u5F85\u7528\u6237\u534F\u52A9\u72B6\u6001" };
    return { ok: true };
  });
  app2.post("/api/generate/:jobId/pause", async (req) => {
    const { jobId } = req.params;
    return pauseJob(jobId) ? { ok: true } : { error: "\u8BE5\u4EFB\u52A1\u4E0D\u5728\u8FD0\u884C\u72B6\u6001" };
  });
  app2.post("/api/generate/:jobId/continue", async (req) => {
    const { jobId } = req.params;
    const { nl, projectId, testCaseId, attachments, baseSteps, resumeLoop } = req.body ?? {};
    if (!nl) return { error: "\u7F3A\u5C11\u8FFD\u52A0\u63CF\u8FF0" };
    if (!Array.isArray(baseSteps)) return { error: "\u7F3A\u5C11\u5DF2\u6709\u6B65\u9AA4" };
    if (!isConfigured()) return { error: "\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E\u300D\u4E2D\u914D\u7F6E\u7F51\u5173\u5730\u5740\u4E0E\u5BC6\u94A5" };
    const envMap = {};
    if (projectId) {
      const vars = await prisma.envVar.findMany({ where: { projectId }, select: { key: true, value: true } });
      for (const v of vars) envMap[v.key] = v.value;
    }
    continueGenerate(jobId, {
      nl,
      envMap,
      attachments: attachments ?? [],
      baseSteps,
      projectId: projectId ?? null,
      testCaseId: testCaseId ?? null,
      // 前端传 resumeLoop=true 时：读回暂停保存的循环状态直接续跑（不重新拆分/确认）
      resumeLoop: Boolean(resumeLoop)
    }).catch((e) => publish({ type: "gen:error", jobId, message: String(e) }));
    return { ok: true };
  });
}

// src/services/recorderService.ts
import { spawn } from "child_process";
import fs5 from "fs";
import os from "os";
import path7 from "path";

// src/codegen/parseCodegen.ts
var QUOTED = /'([^']*)'|"([^"]*)"|`([^`]*)`/;
function firstQuoted(s) {
  const m = s.match(QUOTED);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}
function parseLocator(chain) {
  const roleM = chain.match(
    /getByRole\(\s*['"](\w+)['"]\s*(?:,\s*\{\s*name:\s*(['"])(.*?)\2\s*\})?\s*\)/
  );
  if (roleM) return { strategy: "role", value: roleM[1], role: roleM[1], name: roleM[3] };
  if (/getByLabel\(/.test(chain)) return { strategy: "label", value: firstQuoted(chain) ?? "" };
  if (/getByText\(/.test(chain)) return { strategy: "text", value: firstQuoted(chain) ?? "" };
  if (/getByPlaceholder\(/.test(chain)) return { strategy: "placeholder", value: firstQuoted(chain) ?? "" };
  if (/getByTestId\(/.test(chain)) return { strategy: "testid", value: firstQuoted(chain) ?? "" };
  const locM = chain.match(/locator\(\s*(['"])(.*?)\1\s*\)/);
  if (locM) {
    const val = locM[2];
    return { strategy: val.startsWith("//") ? "xpath" : "css", value: val };
  }
  return void 0;
}
function buildActionStep(method, args, loc, line) {
  switch (method) {
    case "click":
      return { kind: "action", action: "click", locator: loc, description: line };
    case "fill":
      return { kind: "action", action: "fill", locator: loc, value: firstQuoted(args), description: line };
    case "press":
      return { kind: "action", action: "press", locator: loc, key: firstQuoted(args), description: line };
    case "check":
      return { kind: "action", action: "check", locator: loc, description: line };
    case "selectOption":
      return { kind: "action", action: "select", locator: loc, value: firstQuoted(args), description: line };
    default:
      return { kind: "action", action: "raw", code: line, description: line };
  }
}
function parseLine(line) {
  const assertM = line.match(/await expect\((.*)\)\.(toBeVisible|toBeHidden|toHaveText)\(([^)]*)\)/);
  if (assertM) {
    const loc = parseLocator(assertM[1]);
    const m2 = assertM[2];
    const type = m2 === "toHaveText" ? "text" : m2 === "toBeHidden" ? "hidden" : "visible";
    return {
      kind: "assert",
      action: "assert",
      locator: loc,
      assertion: { type, expected: firstQuoted(assertM[3]) },
      description: line
    };
  }
  const gotoM = line.match(/^await page\d*\.goto\((.*)\)$/);
  if (gotoM) {
    return { kind: "navigate", action: "goto", url: firstQuoted(gotoM[1]), description: line };
  }
  const m = line.match(/^await page\d*\.(.+?)\.(\w+)\(([^)]*)\)$/);
  if (m) {
    return buildActionStep(m[2], m[3], parseLocator(m[1]), line);
  }
  return { kind: "action", action: "raw", code: line, description: line };
}
function parseCodegen(code) {
  const lines = code.split("\n").map((l) => l.trim().replace(/;$/, "")).filter((l) => /^await (page\d*\.|expect\()/.test(l));
  return lines.map(parseLine);
}

// src/services/recorderService.ts
function playwrightCli() {
  const candidates = [
    path7.resolve("node_modules/playwright/cli.js"),
    path7.resolve("node_modules/playwright-core/cli.js")
  ];
  for (const c of candidates) if (fs5.existsSync(c)) return c;
  throw new Error("\u627E\u4E0D\u5230 playwright CLI");
}
var recordings = /* @__PURE__ */ new Map();
async function startRecording(jobId, url) {
  const outFile = path7.join(os.tmpdir(), `codegen-${jobId}.js`);
  const cli = playwrightCli();
  const browserArgs = codegenBrowserArgs();
  const proc = spawn(
    process.execPath,
    [cli, "codegen", "--target=javascript", "-o", outFile, url, ...browserArgs, "--viewport-size=1920,1080"],
    {
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderrBuf = "";
  proc.stderr?.on("data", (d) => {
    stderrBuf += String(d);
  });
  recordings.set(jobId, { proc, outFile, processed: false, stderr: () => stderrBuf });
  publish({ type: "record:status", jobId, status: "recording", message: "\u5F55\u5236\u4E2D\uFF0C\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u91CC\u64CD\u4F5C\uFF1B\u5B8C\u6210\u540E\u70B9\u300C\u505C\u6B62\u5E76\u5BFC\u5165\u300D" });
  proc.on("exit", () => {
    importRecording(jobId).catch(() => {
    });
  });
}
async function stopRecording(jobId) {
  const r = recordings.get(jobId);
  if (!r) return;
  try {
    r.proc.kill("SIGTERM");
  } catch {
  }
  await new Promise((res) => setTimeout(res, 500));
  await importRecording(jobId);
}
async function importRecording(jobId) {
  const r = recordings.get(jobId);
  if (!r || r.processed) return;
  r.processed = true;
  let steps = [];
  let rawCode = "";
  try {
    rawCode = fs5.readFileSync(r.outFile, "utf-8");
    steps = parseCodegen(rawCode);
  } catch (e) {
    const detail = r.stderr().trim();
    const hint = detail ? `\uFF1Bcodegen \u8F93\u51FA\uFF1A${detail.slice(-300)}` : "";
    publish({ type: "record:error", jobId, message: `\u8BFB\u53D6\u5F55\u5236\u6587\u4EF6\u5931\u8D25\uFF1A${String(e)}${hint}` });
    return;
  } finally {
    recordings.delete(jobId);
    try {
      fs5.unlinkSync(r.outFile);
    } catch {
    }
  }
  publish({ type: "record:imported", jobId, steps, rawCode });
}

// src/routes/record.ts
async function recordRoutes(app2) {
  app2.post("/api/record/start", async (req) => {
    const { url } = req.body ?? {};
    if (!url) return { error: "\u7F3A\u5C11\u8D77\u59CB\u5730\u5740" };
    const { randomUUID: randomUUID5 } = await import("crypto");
    const jobId = randomUUID5();
    await startRecording(jobId, url);
    return { jobId };
  });
  app2.post("/api/record/stop", async (req) => {
    const { jobId } = req.body ?? {};
    if (!jobId) return { error: "\u7F3A\u5C11 jobId" };
    await stopRecording(jobId);
    return { ok: true };
  });
}

// src/services/loginRecorderService.ts
import { chromium as chromium5 } from "playwright";
var sessions2 = /* @__PURE__ */ new Map();
async function startLoginRecording(jobId, url, viewport) {
  const browser = await chromium5.launch(browserLaunchOptions({ headless: false, viewport: viewport ?? void 0 }));
  const context = await browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (e) {
    publish({ type: "loginconfig:status", jobId, status: "warning", message: `\u6253\u5F00\u9875\u9762\u5931\u8D25\uFF1A${String(e)}\uFF0C\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u624B\u52A8\u5BFC\u822A` });
  }
  sessions2.set(jobId, { browser, context, stopped: false });
  publish({ type: "loginconfig:status", jobId, status: "recording", message: "\u8BF7\u5728\u5F39\u51FA\u7684\u6D4F\u89C8\u5668\u4E2D\u5B8C\u6210\u767B\u5F55\uFF0C\u5B8C\u6210\u540E\u70B9\u300C\u505C\u6B62\u5E76\u4FDD\u5B58\u300D" });
  browser.on("disconnected", () => {
    const s = sessions2.get(jobId);
    if (!s || s.stopped) return;
    sessions2.delete(jobId);
    publish({ type: "loginconfig:error", jobId, message: "\u6D4F\u89C8\u5668\u5DF2\u5173\u95ED\uFF0C\u672A\u4FDD\u5B58\u767B\u5F55\u72B6\u6001\u3002\u8BF7\u91CD\u65B0\u5F55\u5236\uFF0C\u5E76\u5728\u4FDD\u5B58\u524D\u4E0D\u8981\u5173\u95ED\u6D4F\u89C8\u5668\u3002" });
  });
}
async function cancelLoginRecording(jobId) {
  const s = sessions2.get(jobId);
  if (!s) return;
  s.stopped = true;
  sessions2.delete(jobId);
  try {
    await s.browser.close();
  } catch {
  }
}
async function stopLoginRecording(jobId) {
  const s = sessions2.get(jobId);
  if (!s) throw new Error("\u5F55\u5236\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u7ED3\u675F\uFF08\u53EF\u80FD\u6D4F\u89C8\u5668\u5DF2\u88AB\u5173\u95ED\uFF09");
  s.stopped = true;
  let storageState;
  try {
    storageState = await s.context.storageState();
  } finally {
    sessions2.delete(jobId);
    try {
      await s.browser.close();
    } catch {
    }
  }
  return { storageState };
}

// src/routes/loginConfigs.ts
async function loginConfigRoutes(app2) {
  app2.get("/api/projects/:id/login-configs", async (req, reply) => {
    const { id } = req.params;
    const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: "\u9879\u76EE\u4E0D\u5B58\u5728" });
    return prisma.loginConfig.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, isDefault: true, createdAt: true }
    });
  });
  app2.post("/api/projects/:id/login-configs", async (req, reply) => {
    const { id } = req.params;
    const { name, storageState } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "\u7F3A\u5C11\u914D\u7F6E\u540D\u79F0" });
    if (!storageState) return reply.code(400).send({ error: "\u7F3A\u5C11\u767B\u5F55\u72B6\u6001\u6570\u636E" });
    const count = await prisma.loginConfig.count({ where: { projectId: id } });
    return prisma.loginConfig.create({
      data: {
        projectId: id,
        name: name.trim(),
        storageState,
        isDefault: count === 0
        // 首个自动设为默认
      },
      select: { id: true, name: true, isDefault: true, createdAt: true }
    });
  });
  app2.put("/api/login-configs/:id", async (req, reply) => {
    const { id } = req.params;
    const { name } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "\u7F3A\u5C11\u914D\u7F6E\u540D\u79F0" });
    return prisma.loginConfig.update({
      where: { id },
      data: { name: name.trim() },
      select: { id: true, name: true, isDefault: true, createdAt: true }
    });
  });
  app2.put("/api/login-configs/:id/storage-state", async (req, reply) => {
    const { id } = req.params;
    const { storageState } = req.body ?? {};
    if (!storageState) return reply.code(400).send({ error: "\u7F3A\u5C11\u767B\u5F55\u72B6\u6001\u6570\u636E" });
    return prisma.loginConfig.update({
      where: { id },
      data: { storageState },
      select: { id: true, name: true, isDefault: true, createdAt: true }
    });
  });
  app2.put("/api/projects/:id/login-configs/:configId/default", async (req) => {
    const { id, configId } = req.params;
    await prisma.$transaction([
      prisma.loginConfig.updateMany({ where: { projectId: id, isDefault: true }, data: { isDefault: false } }),
      prisma.loginConfig.update({ where: { id: configId }, data: { isDefault: true } })
    ]);
    return { ok: true };
  });
  app2.delete("/api/login-configs/:id", async (req) => {
    const { id } = req.params;
    const deleted = await prisma.loginConfig.findUnique({
      where: { id },
      select: { projectId: true, isDefault: true }
    });
    if (!deleted) return { ok: true };
    await prisma.loginConfig.delete({ where: { id } });
    if (deleted.isDefault) {
      const next = await prisma.loginConfig.findFirst({
        where: { projectId: deleted.projectId },
        orderBy: { createdAt: "desc" }
      });
      if (next) await prisma.loginConfig.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { ok: true };
  });
  app2.post("/api/projects/:id/login-configs/record/start", async (req) => {
    const { url } = req.body ?? {};
    if (!url) return { error: "\u7F3A\u5C11\u8D77\u59CB\u5730\u5740" };
    const { id } = req.params;
    const project = await prisma.project.findUnique({ where: { id }, select: { viewport: true } });
    const viewport = readViewport(project?.viewport);
    const { randomUUID: randomUUID5 } = await import("crypto");
    const jobId = randomUUID5();
    await startLoginRecording(jobId, url, viewport);
    return { jobId };
  });
  app2.post("/api/login-configs/record/stop", async (req, reply) => {
    const { jobId } = req.body ?? {};
    if (!jobId) return reply.code(400).send({ error: "\u7F3A\u5C11 jobId" });
    try {
      return await stopLoginRecording(jobId);
    } catch (e) {
      return reply.code(400).send({ error: String(e) });
    }
  });
  app2.post("/api/login-configs/record/cancel", async (req, reply) => {
    const { jobId } = req.body ?? {};
    if (!jobId) return reply.code(400).send({ error: "\u7F3A\u5C11 jobId" });
    await cancelLoginRecording(jobId);
    return { ok: true };
  });
}

// src/routes/attachments.ts
async function streamToBuffer(stream) {
  const chunks = [];
  let size = 0;
  for await (const c of stream) {
    size += c.length;
    if (size > MAX_FILE_SIZE) throw new Error("\u6587\u4EF6\u8FC7\u5927\uFF08\u5355\u6587\u4EF6\u4E0A\u9650 20MB\uFF09");
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}
async function attachmentRoutes(app2) {
  app2.post("/api/attachments", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "\u672A\u6536\u5230\u6587\u4EF6" });
    const size = data.file.truncated ? MAX_FILE_SIZE + 1 : 0;
    let buffer;
    try {
      buffer = await streamToBuffer(data.file);
    } catch (e) {
      data.file.resume();
      return reply.code(400).send({ error: String(e) });
    }
    if (size > MAX_FILE_SIZE || buffer.length > MAX_FILE_SIZE) {
      return reply.code(400).send({ error: "\u6587\u4EF6\u8FC7\u5927\uFF08\u5355\u6587\u4EF6\u4E0A\u9650 20MB\uFF09" });
    }
    const name = data.filename || "file";
    try {
      const att = await storeAttachment({ name, mime: data.mimetype ?? "", size: buffer.length, buffer });
      return {
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        isImage: att.isImage,
        contentPreview: att.content.slice(0, 5e3)
      };
    } catch (e) {
      return reply.code(400).send({ error: `${name} \u5904\u7406\u5931\u8D25\uFF1A${String(e)}` });
    }
  });
  app2.delete("/api/attachments/:id", async (req) => {
    deleteAttachment(req.params.id);
    return { ok: true };
  });
}

// src/routes/locator.ts
import { randomUUID as randomUUID4 } from "crypto";

// src/services/locatorPickerService.ts
import { chromium as chromium6 } from "playwright";

// src/services/pickerScript.ts
var PICKER_UI_SCRIPT = String.raw`(() => {
  if (window.__testToolPickInstalled__) return;
  window.__testToolPickInstalled__ = true;

  // ---- 覆盖层 UI（默认 pointer-events:none，不拦截页面交互）----
  const host = document.createElement('div');
  host.setAttribute('data-tt-picker-host', '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

  // 顶部状态栏：始终 pointer-events:auto（鼠标事件不穿透到底层元素，避免底层显示悬停选框），可拖动移动、可展开显示完整信息
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7c3aed;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;white-space:nowrap;pointer-events:auto;user-select:none;cursor:grab;max-width:80%;';
  const barHint = document.createElement('span');
  barHint.textContent = '拾取元素：普通点击可正常展开页面；按住 Alt 点击要拾取的元素，再点「确认拾取」完成 · Esc 取消';
  const barPick = document.createElement('span');
  barPick.style.cssText = 'display:none;align-items:center;gap:6px;';
  const barCandidate = document.createElement('span');
  barCandidate.style.cssText = 'max-width:420px;overflow:hidden;text-overflow:ellipsis;';
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确认拾取';
  confirmBtn.style.cssText = 'background:#22c55e;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = 'background:rgba(255,255,255,.25);color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer;';
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '▾';
  expandBtn.title = '展开/收起完整信息';
  expandBtn.style.cssText = 'background:transparent;color:#fff;border:none;border-radius:4px;padding:2px 4px;font-size:12px;cursor:pointer;';
  barPick.appendChild(barCandidate);
  barPick.appendChild(confirmBtn);
  barPick.appendChild(cancelBtn);
  bar.appendChild(barHint);
  bar.appendChild(barPick);
  bar.appendChild(expandBtn);
  host.appendChild(bar);

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:2px solid #7c3aed;background:rgba(124,58,237,.12);display:none;';
  host.appendChild(box);

  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;top:0;left:0;display:none;background:#111827;color:#e5e7eb;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:4px 8px;border-radius:4px;max-width:460px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  host.appendChild(tag);

  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);background:#dc2626;color:#fff;padding:5px 12px;border-radius:6px;font-size:12px;display:none;box-shadow:0 2px 12px rgba(0,0,0,.25);';
  host.appendChild(hint);

  // addInitScript 在 document_start 执行，此时 documentElement/body 尚不存在，延迟挂载覆盖层
  function ensureHost() {
    if (host.parentNode) return;
    const root = document.documentElement || document.body || document.head;
    if (root) root.appendChild(host);
    else setTimeout(ensureHost, 0);
  }
  ensureHost();

  function showHint(text, ms) {
    hint.textContent = text;
    hint.style.display = 'block';
    clearTimeout(showHint._t);
    showHint._t = setTimeout(function () { hint.style.display = 'none'; }, ms || 2500);
  }

  let pendingEl = null;
  let pendingCands = null; // 点击选中时缓存的候选（此时元素未脱离文档，css/xpath 候选才有效）
  let lastAnalyzedEl = null; // 悬停预览按元素变化才重算重复数，避免反复遍历

  function showPending(el) {
    pendingEl = el;
    const r = window.__ttAnalyze(el);
    pendingCands = r ? r.candidates : [];
    // 请求后端用真实 Playwright 验证候选（预览即所见：预览展示的就是最终会落库的定位器）
    window.__testToolPickEl__ = el;
    window.__testToolPickUrl__ = location.href;
    window.__testToolPick__ = { type: 'preview', candidates: pendingCands };
    barCandidate.textContent = '验证中…';
    barHint.style.display = 'none';
    barPick.style.display = 'inline-flex';
  }

  // 轮询后端回写的 Playwright 验证结果，更新预览栏（与最终落库一致）
  setInterval(function () {
    if (!pendingEl) return;
    const res = window.__testToolPickResult__;
    if (!res || typeof res !== 'object') return;
    window.__testToolPickResult__ = null;
    barCandidate.textContent = res.locator
      ? '将拾取：' + window.__ttLocDesc(res.locator) + '（Playwright 验证通过）'
      : '无唯一可用定位器，将回退 css/xpath';
  }, 200);

  function clearPending() {
    pendingEl = null;
    pendingCands = null;
    barPick.style.display = 'none';
    barHint.style.display = '';
  }

  function confirmPick() {
    if (!pendingEl) return;
    const el = pendingEl;
    const cands = pendingCands && pendingCands.length ? pendingCands : (window.__ttAnalyze(el) || {}).candidates || [];
    clearPending();
    // 不改动原元素 DOM：把元素引用存入 window，后端经 Playwright handle 用 isSameNode 比对命中元素。
    // 同时记录当前 URL：SPA 重渲染可能替换该元素导致引用脱离，后端据此判断是否仍可采信唯一性结果。
    window.__testToolPickEl__ = el;
    window.__testToolPickUrl__ = location.href;
    window.__testToolPick__ = { type: 'pick', candidates: cands };
  }

  confirmBtn.addEventListener('click', function (e) { e.stopPropagation(); confirmPick(); });
  cancelBtn.addEventListener('click', function (e) { e.stopPropagation(); clearPending(); });

  // ---- 状态栏拖动 / 展开 ----
  let expanded = false;
  function applyExpand() {
    expandBtn.textContent = expanded ? '▴' : '▾';
    barCandidate.style.maxWidth = expanded ? 'none' : '420px';
    barCandidate.style.whiteSpace = expanded ? 'normal' : 'nowrap';
    bar.style.whiteSpace = expanded ? 'normal' : 'nowrap';
    bar.style.maxWidth = expanded ? '80vw' : '80%';
  }
  expandBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    expanded = !expanded;
    applyExpand();
  });

  let dragging = null; // {dx, dy} 鼠标相对状态栏左上角的偏移
  bar.addEventListener('mousedown', function (e) {
    if (e.target === confirmBtn || e.target === cancelBtn || e.target === expandBtn) return;
    const r = bar.getBoundingClientRect();
    // 从「top:10px + translateX(-50%)」的居中定位切换为显式 left/top，之后按增量更新
    bar.style.transform = 'none';
    bar.style.left = r.left + 'px';
    bar.style.top = r.top + 'px';
    dragging = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    bar.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const r = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - dragging.dx, window.innerWidth - r.width));
    const y = Math.max(0, Math.min(e.clientY - dragging.dy, window.innerHeight - r.height));
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
  });
  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = null;
    bar.style.cursor = 'grab';
  });

  function onMouseOver(e) {
    let el = e.target;
    if (e.composedPath && e.composedPath()[0]) el = e.composedPath()[0];
    if (!el || el.nodeType !== 1) return;
    if (el === host || host.contains(el)) {
      // 鼠标在覆盖层（如状态栏）上：事件不穿透，隐藏对底层元素的预览选框与标签
      box.style.display = 'none';
      tag.style.display = 'none';
      lastAnalyzedEl = null;
      return;
    }
    if (el.ownerDocument !== document) return; // iframe 内不预览
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = Math.max(r.width, 2) + 'px';
    box.style.height = Math.max(r.height, 2) + 'px';
    let ty = r.top - 24;
    if (ty < 0) ty = r.bottom + 4;
    tag.style.left = Math.max(4, r.left) + 'px';
    tag.style.top = ty + 'px';
    if (el === lastAnalyzedEl) return; // 同一元素只重算一次重复数
    lastAnalyzedEl = el;
    const a = window.__ttAnalyze(el);
    tag.textContent = '将拾取：' + (a ? window.__ttDescribe(a.candidates, a.counts) : '（无可用定位器）');
    tag.style.display = 'block';
  }

  function onClick(e) {
    let el = e.target;
    if (e.composedPath && e.composedPath()[0]) el = e.composedPath()[0];
    if (!el || el.nodeType !== 1) return;
    if (el === host || host.contains(el)) return; // 覆盖层自身（含确认/取消按钮），不当作页面元素
    // 普通点击完全穿透（用于展开菜单/弹层、触发页面逻辑），不选中任何元素；
    // 仅 Alt+点击表示拾取意图：拦截该点击（页面收不到、无副作用）并把元素置为待确认。
    if (!e.altKey) return;
    if (el.ownerDocument !== document) {
      showHint('暂不支持拾取 iframe 内的元素，请在主文档中选择');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showPending(el);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (pendingEl) clearPending();
      else window.__testToolPick__ = { type: 'cancel' };
    }
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();`;
var PICKER_SCRIPT = CANDIDATE_SCRIPT + PICKER_UI_SCRIPT;

// src/services/locatorPickerService.ts
var sessions3 = /* @__PURE__ */ new Map();
var POLL_INTERVAL_MS = 200;
var SESSION_TTL_MS = 10 * 60 * 1e3;
function safeJsonParse3(s) {
  try {
    return JSON.parse(s);
  } catch {
    return void 0;
  }
}
async function resolvePickViewport(projectId, loginConfigId) {
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { viewport: true } });
    if (p) return readViewport(p.viewport);
  }
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({
      where: { id: loginConfigId },
      select: { project: { select: { viewport: true } } }
    });
    if (cfg) return readViewport(cfg.project?.viewport);
  }
  return null;
}
async function startPick(pickId, url, loginConfigId, projectId) {
  let storageState;
  if (loginConfigId) {
    const cfg = await prisma.loginConfig.findUnique({ where: { id: loginConfigId }, select: { storageState: true } });
    if (cfg?.storageState) {
      storageState = typeof cfg.storageState === "string" ? safeJsonParse3(cfg.storageState) : cfg.storageState;
    }
  }
  const viewport = await resolvePickViewport(projectId, loginConfigId);
  let browser;
  try {
    browser = await chromium6.launch({ ...browserLaunchOptions({ headless: false, viewport: viewport ?? void 0 }) });
    const context = storageState ? await browser.newContext({ storageState, viewport: viewport ?? DEFAULT_VIEWPORT }) : await browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
    const page = await context.newPage();
    const pluginScripts = await enabledInpageScripts();
    if (pluginScripts.length) await page.addInitScript(buildPluginInitScript(pluginScripts));
    await page.addInitScript(PICKER_SCRIPT);
    await page.goto(url, { timeout: 3e4, waitUntil: "domcontentloaded" });
    const session = { browser, page, state: "pending", closed: false };
    sessions3.set(pickId, session);
    browser.on("disconnected", () => {
      void finalize(pickId, { state: "cancelled" });
    });
    session.timer = setInterval(() => {
      void (async () => {
        const s = sessions3.get(pickId);
        if (!s || s.state !== "pending" || s.closed) return;
        let val = null;
        try {
          val = await s.page.evaluate(() => globalThis.__testToolPick__ ?? null);
        } catch {
          return;
        }
        if (!val || typeof val !== "object") return;
        const v = val;
        if (v.type === "preview") {
          const result = await verifyLocators(s.page, v.candidates ?? []);
          await s.page.evaluate((loc) => {
            globalThis.__testToolPickResult__ = { locator: loc };
          }, result.locator ?? null).catch(() => {
          });
        } else if (v.type === "pick") {
          const result = await verifyLocators(s.page, v.candidates ?? []);
          if (result.locator) await finalize(pickId, { state: "done", locator: result.locator });
          else
            await finalize(pickId, {
              state: "error",
              error: `\u672A\u80FD\u751F\u6210\u552F\u4E00\u53EF\u7528\u7684\u5B9A\u4F4D\u5668\uFF08\u5DF2\u68C0\u67E5\uFF1A${result.tried.join("\uFF0C")}\uFF09\uFF0C\u8BF7\u91CD\u8BD5\u6216\u6362\u4E00\u4E2A\u5143\u7D20`
            });
        } else if (v.type === "cancel") {
          await finalize(pickId, { state: "cancelled" });
        }
      })();
    }, POLL_INTERVAL_MS);
    session.ttl = setTimeout(() => {
      void finalize(pickId, { state: "cancelled" });
    }, SESSION_TTL_MS);
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch {
      }
    }
    throw e;
  }
}
function getPick(pickId) {
  const s = sessions3.get(pickId);
  if (!s) return void 0;
  return { status: s.state, locator: s.locator, error: s.error };
}
async function cancelPick(pickId) {
  const s = sessions3.get(pickId);
  if (!s) return;
  if (s.state === "pending" && !s.closed) {
    await finalize(pickId, { state: "cancelled" });
  } else if (!s.closed) {
    s.closed = true;
    try {
      await s.browser.close();
    } catch {
    }
  }
}
async function finalize(pickId, result) {
  const s = sessions3.get(pickId);
  if (!s || s.closed) return;
  s.closed = true;
  s.state = result.state;
  s.locator = result.locator;
  s.error = result.error;
  if (s.timer) clearInterval(s.timer);
  if (s.ttl) clearTimeout(s.ttl);
  try {
    await s.browser.close();
  } catch {
  }
  setTimeout(() => sessions3.delete(pickId), 6e4);
}
async function verifyLocators(page, candidates) {
  const target = await page.evaluateHandle(() => globalThis.__testToolPickEl__ ?? null).catch(() => null);
  if (!target) return { tried: ["\u76EE\u6807\u5143\u7D20\u5DF2\u5931\u6548"] };
  const targetInfo = await target.evaluate((n) => n && n.nodeType === 1 ? { connected: n.isConnected } : null).catch(() => null);
  if (!targetInfo) {
    await target.dispose().catch(() => {
    });
    return { tried: ["\u76EE\u6807\u5143\u7D20\u5DF2\u5931\u6548"] };
  }
  let fallback = false;
  if (!targetInfo.connected) {
    const pickUrl = await page.evaluate(() => globalThis.__testToolPickUrl__ ?? "").catch(() => "");
    fallback = !!pickUrl && page.url() === pickUrl;
  }
  const res = await verifyCandidates(page, target, candidates, { fallback, enableRecompute: !fallback });
  await target.dispose().catch(() => {
  });
  return res;
}

// src/routes/locator.ts
async function locatorRoutes(app2) {
  app2.post("/api/locator/pick", async (req, reply) => {
    const { url, loginConfigId, projectId } = req.body ?? {};
    if (!url?.trim()) return reply.code(400).send({ error: "\u7F3A\u5C11\u9875\u9762\u5730\u5740" });
    const pickId = randomUUID4();
    try {
      await startPick(pickId, url.trim(), loginConfigId, projectId?.trim() || void 0);
    } catch (e) {
      return reply.code(500).send({ error: `\u542F\u52A8\u62FE\u53D6\u5931\u8D25\uFF1A${String(e)}` });
    }
    return { pickId };
  });
  app2.get("/api/locator/pick/:id", async (req, reply) => {
    const s = getPick(req.params.id);
    if (!s) return reply.code(404).send({ error: "\u62FE\u53D6\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F" });
    return s;
  });
  app2.post("/api/locator/pick/:id/cancel", async (req) => {
    await cancelPick(req.params.id);
    return { ok: true };
  });
}

// src/routes/generationLogs.ts
async function generationLogRoutes(app2) {
  app2.get("/api/generation-logs", async (req) => {
    const q = req.query ?? {};
    const limit = q.limit ? Math.max(1, Math.min(200, Number(q.limit))) : 20;
    const offset = q.offset ? Math.max(0, Number(q.offset)) : 0;
    const status = q.status && q.status !== "ALL" ? q.status : "ALL";
    return listLogs({ limit, offset, keyword: q.keyword, status });
  });
  app2.get("/api/generation-logs/:id", async (req, reply) => {
    const { id } = req.params;
    const log = await getLogById(id);
    if (!log) return reply.code(404).send({ error: "\u8BB0\u5F55\u4E0D\u5B58\u5728" });
    return log;
  });
  app2.delete("/api/generation-logs/:id", async (req) => {
    const { id } = req.params;
    await deleteLog(id);
    return { ok: true };
  });
  app2.delete("/api/generation-logs", async (req) => {
    const body = req.body ?? {};
    const count = await deleteLogs(Array.isArray(body.ids) ? body.ids : []);
    return { ok: true, count };
  });
  app2.post("/api/generation-logs/prune", async () => {
    const days = getConfig().generationLogRetentionDays;
    const count = await pruneExpired(days);
    return { ok: true, count, days };
  });
}

// src/routes/plugins.ts
import { chromium as chromium7 } from "playwright";
import AdmZip from "adm-zip";
var PRESET_DETAIL_INCLUDE = {
  items: {
    orderBy: { priority: "asc" },
    include: { plugin: { select: { id: true, name: true, actions: true, builtin: true } } }
  },
  _count: { select: { projects: true } }
};
async function savePreset(o) {
  const ids = (o.pluginIds ?? []).filter(Boolean);
  const found = await prisma.plugin.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const valid = new Set(found.map((f) => f.id));
  const ordered = ids.filter((x) => valid.has(x));
  const items = ordered.map((pluginId, priority) => ({ pluginId, priority }));
  const itemWrite = o.id ? { deleteMany: {}, create: items } : { create: items };
  const data = {
    name: o.name,
    description: o.description ?? void 0,
    items: itemWrite
  };
  return o.id ? prisma.pluginPreset.update({ where: { id: o.id }, data, include: PRESET_DETAIL_INCLUDE }) : prisma.pluginPreset.create({
    data: { ...data, builtin: o.builtin },
    include: PRESET_DETAIL_INCLUDE
  });
}
function parsePluginPackage(buf, filename) {
  const fname = filename.toLowerCase();
  try {
    if (fname.endsWith(".zip")) {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);
      if (entries.length > 20) return { error: "\u63D2\u4EF6\u5305\u6210\u5458\u8FC7\u591A\uFF08\u8D85\u8FC7 20 \u4E2A\u6587\u4EF6\uFF09" };
      const total = entries.reduce((s, e) => s + e.header.size, 0);
      if (total > MAX_PLUGIN_BYTES) return { error: "\u63D2\u4EF6\u5305\u603B\u91CF\u8D85\u8FC7 512KB \u4E0A\u9650" };
      let mf = entries.find((e) => e.entryName === "manifest.json");
      let base = "";
      if (!mf) {
        const nested = entries.filter((e) => /^[^/]+\/manifest\.json$/.test(e.entryName));
        if (nested.length > 1) return { error: "zip \u5305\u542B\u591A\u4E2A manifest.json\uFF0C\u65E0\u6CD5\u786E\u5B9A\u5165\u53E3" };
        mf = nested[0];
        if (mf) base = mf.entryName.slice(0, -"manifest.json".length);
      }
      if (!mf) return { error: "zip \u5305\u7F3A\u5C11 manifest.json\uFF08\u9700\u5728 zip \u6839\u76EE\u5F55\u6216\u552F\u4E00\u7684\u5355\u5C42\u76EE\u5F55\u5185\uFF09" };
      let manifest;
      try {
        manifest = JSON.parse(mf.getData().toString("utf-8"));
      } catch {
        return { error: "manifest.json \u65E0\u6CD5\u89E3\u6790" };
      }
      const relEntry = String(manifest.entry ?? "index.js").replace(/^\.\//, "").replace(/^\//, "");
      const entry = entries.find((e) => e.entryName === base + relEntry);
      if (!entry) return { error: `\u5165\u53E3\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${base + relEntry}` };
      return { entryFile: entry.getData().toString("utf-8") };
    }
    if (fname.endsWith(".js")) return { entryFile: buf.toString("utf-8") };
    return { error: "\u4EC5\u652F\u6301 .js \u6216 .zip \u63D2\u4EF6\u5305" };
  } catch (e) {
    return { error: `\u63D2\u4EF6\u5305\u89E3\u6790\u5931\u8D25\uFF1A${String(e)}` };
  }
}
async function pluginRoutes(app2) {
  app2.post("/api/plugins/upload", async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_PLUGIN_BYTES } });
    if (!file) return reply.code(400).send({ error: "\u7F3A\u5C11\u63D2\u4EF6\u6587\u4EF6" });
    const fields = file.fields ?? {};
    const name = String(fields.name?.value ?? "").trim();
    const version = String(fields.version?.value ?? "").trim() || "1.0.0";
    const description = String(fields.description?.value ?? "").trim() || null;
    if (!name) return reply.code(400).send({ error: "\u7F3A\u5C11\u63D2\u4EF6\u540D\u79F0" });
    const buf = await file.toBuffer();
    if (buf.length > MAX_PLUGIN_BYTES) return reply.code(400).send({ error: "\u63D2\u4EF6\u8D85\u8FC7 512KB \u4E0A\u9650" });
    const parsed = parsePluginPackage(buf, file.filename ?? "");
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    const entryFile = parsed.entryFile;
    try {
      validatePluginCode(entryFile);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    const dup = await prisma.plugin.findUnique({ where: { name }, select: { id: true } });
    if (dup) return reply.code(400).send({ error: `\u540C\u540D\u63D2\u4EF6\u5DF2\u5B58\u5728\uFF1A${name}` });
    const created = await prisma.plugin.create({
      data: { name, version, description, entryFile, source: "upload", builtin: false }
    });
    const warnings = await actionLabelConflicts(extractDeclaredActionLabels(entryFile));
    return { ...created, warnings };
  });
  app2.post("/api/plugins/:id/file", async (req, reply) => {
    const { id } = req.params;
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: "\u63D2\u4EF6\u4E0D\u5B58\u5728" });
    if (p.builtin) return reply.code(403).send({ error: "\u5185\u7F6E\u63D2\u4EF6\u4E0D\u53EF\u91CD\u65B0\u4E0A\u4F20\uFF0C\u968F\u5E73\u53F0\u7248\u672C\u53D1\u5E03\u66F4\u65B0" });
    const file = await req.file({ limits: { fileSize: MAX_PLUGIN_BYTES } });
    if (!file) return reply.code(400).send({ error: "\u7F3A\u5C11\u63D2\u4EF6\u6587\u4EF6" });
    const fields = file.fields ?? {};
    const version = String(fields.version?.value ?? "").trim();
    const description = String(fields.description?.value ?? "").trim();
    const buf = await file.toBuffer();
    if (buf.length > MAX_PLUGIN_BYTES) return reply.code(400).send({ error: "\u63D2\u4EF6\u8D85\u8FC7 512KB \u4E0A\u9650" });
    const parsed = parsePluginPackage(buf, file.filename ?? "");
    if (parsed.error) return reply.code(400).send({ error: parsed.error });
    try {
      validatePluginCode(parsed.entryFile);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    const updated = await prisma.plugin.update({
      where: { id },
      data: {
        entryFile: parsed.entryFile,
        ...version ? { version } : {},
        ...description ? { description } : {}
      }
    });
    const warnings = await actionLabelConflicts(extractDeclaredActionLabels(parsed.entryFile), id);
    return { ...updated, warnings };
  });
  app2.get("/api/plugins", async () => {
    const list = await prisma.plugin.findMany({
      orderBy: [{ builtin: "desc" }, { createdAt: "asc" }],
      include: { presets: { include: { preset: { select: { name: true } } } } }
    });
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      source: p.source,
      builtin: p.builtin,
      actions: p.actions,
      presetNames: p.presets.map((i) => i.preset.name),
      createdAt: p.createdAt
    }));
  });
  app2.get("/api/plugin-actions", async (req) => {
    const { projectId } = req.query;
    return enabledActionVocabulary(projectId || null);
  });
  app2.patch("/api/plugins/:id", async (req, reply) => {
    const { id } = req.params;
    const { description } = req.body ?? {};
    const p = await prisma.plugin.findUnique({ where: { id }, select: { id: true } });
    if (!p) return reply.code(404).send({ error: "\u63D2\u4EF6\u4E0D\u5B58\u5728" });
    return prisma.plugin.update({
      where: { id },
      data: { description: typeof description === "string" ? description : void 0 }
    });
  });
  app2.delete("/api/plugins/:id", async (req, reply) => {
    const { id } = req.params;
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: "\u63D2\u4EF6\u4E0D\u5B58\u5728" });
    if (p.builtin) return reply.code(403).send({ error: "\u5185\u7F6E\u63D2\u4EF6\u4E0D\u53EF\u5220\u9664" });
    await prisma.plugin.delete({ where: { id } });
    return { ok: true };
  });
  app2.post("/api/plugins/:id/test", async (req, reply) => {
    const { id } = req.params;
    const { url } = req.body ?? {};
    if (!url) return reply.code(400).send({ error: "\u7F3A\u5C11\u76EE\u6807\u5730\u5740" });
    const p = await prisma.plugin.findUnique({ where: { id } });
    if (!p) return reply.code(404).send({ error: "\u63D2\u4EF6\u4E0D\u5B58\u5728" });
    let browser;
    try {
      browser = await chromium7.launch({ ...browserLaunchOptions({ headless: true }) });
      const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
      const page = await context.newPage();
      try {
        await installPluginPwBridge(context);
      } catch {
      }
      await page.addInitScript(buildPluginInitScript([{ id: p.name, code: p.entryFile }]));
      await page.goto(url, { timeout: 3e4, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const result = await page.evaluate(() => {
        const reg = globalThis.__ttPluginRegistry__;
        const log = [];
        if (!reg) {
          return { detectHit: false, detectedPlugins: [], candidatesCount: 0, actions: [], log: ["\u8FD0\u884C\u65F6\u6846\u67B6\u672A\u6CE8\u5165"] };
        }
        const els = Array.from(document.body ? document.body.querySelectorAll("*") : []).slice(0, 2e3);
        let candidatesCount = 0;
        let detectHit = false;
        for (const el of els) {
          const hits = reg.detectAll(el);
          if (!hits.length) continue;
          detectHit = true;
          const cs = reg.candidatesFor(el);
          if (cs.length) {
            candidatesCount += cs.length;
            if (log.length < 30) {
              const cls = String(el.className || "").split(" ").slice(0, 2).join(".");
              log.push(
                `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} \u2192 ${cs.map((c) => c.strategy + "=" + String(c.value).slice(0, 40)).join(" | ")}`
              );
            }
          }
        }
        const bodyHits = reg.detectAll(document.body).map((h) => h.id);
        return {
          detectHit: detectHit || bodyHits.length > 0,
          detectedPlugins: bodyHits,
          candidatesCount,
          actions: reg.listActions(),
          log
        };
      });
      const byName = new Map(parseActionMeta(p.actions).map((m) => [m.name, m]));
      const collected = (result.actions ?? []).flatMap((x) => x.actions);
      const merged = collected.map((m) => {
        const prev = byName.get(m.name);
        return {
          name: m.name,
          doc: m.doc ?? prev?.doc,
          label: m.label ?? prev?.label,
          preferFill: m.preferFill || prev?.preferFill || void 0
        };
      });
      const labelWarnings = await actionLabelConflicts(merged, id);
      if (labelWarnings.length) result.log.push(...labelWarnings);
      await prisma.plugin.update({ where: { id }, data: { actions: merged } }).catch(() => {
      });
      return result;
    } catch (e) {
      return reply.code(500).send({ error: `\u8BD5\u8FD0\u884C\u5931\u8D25\uFF1A${String(e)}` });
    } finally {
      try {
        await browser?.close();
      } catch {
      }
    }
  });
  app2.get(
    "/api/plugin-presets",
    async () => prisma.pluginPreset.findMany({
      orderBy: [{ builtin: "desc" }, { createdAt: "asc" }],
      include: PRESET_DETAIL_INCLUDE
    })
  );
  app2.post("/api/plugin-presets", async (req, reply) => {
    const { name, description, pluginIds } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "\u7F3A\u5C11\u9884\u8BBE\u540D\u79F0" });
    const dup = await prisma.pluginPreset.findUnique({ where: { name: name.trim() } });
    if (dup) return reply.code(400).send({ error: `\u540C\u540D\u9884\u8BBE\u5DF2\u5B58\u5728\uFF1A${name.trim()}` });
    return savePreset({
      name: name.trim(),
      description: description ?? null,
      builtin: false,
      pluginIds: Array.isArray(pluginIds) ? pluginIds : []
    });
  });
  app2.patch("/api/plugin-presets/:id", async (req, reply) => {
    const { id } = req.params;
    const { name, description, pluginIds } = req.body ?? {};
    const preset2 = await prisma.pluginPreset.findUnique({
      where: { id },
      include: { items: { orderBy: { priority: "asc" } } }
    });
    if (!preset2) return reply.code(404).send({ error: "\u9884\u8BBE\u4E0D\u5B58\u5728" });
    const builtinSet = preset2.builtin ? new Set(
      (await prisma.plugin.findMany({
        where: { id: { in: preset2.items.map((i) => i.pluginId) }, builtin: true },
        select: { id: true }
      })).map((p) => p.id)
    ) : null;
    const ids = Array.isArray(pluginIds) ? [...pluginIds] : preset2.items.map((i) => i.pluginId);
    if (builtinSet) {
      for (const i of preset2.items) if (builtinSet.has(i.pluginId) && !ids.includes(i.pluginId)) ids.push(i.pluginId);
    }
    return savePreset({
      id,
      name: preset2.builtin ? preset2.name : name?.trim() ?? preset2.name,
      description: typeof description === "string" ? description : void 0,
      builtin: false,
      pluginIds: ids
    });
  });
  app2.delete("/api/plugin-presets/:id", async (req, reply) => {
    const { id } = req.params;
    const preset2 = await prisma.pluginPreset.findUnique({ where: { id } });
    if (!preset2) return reply.code(404).send({ error: "\u9884\u8BBE\u4E0D\u5B58\u5728" });
    if (preset2.builtin) return reply.code(403).send({ error: "\u5185\u7F6E\u9884\u8BBE\u4E0D\u53EF\u5220\u9664" });
    await prisma.project.updateMany({ where: { presetId: id }, data: { presetId: null } });
    await prisma.pluginPreset.delete({ where: { id } });
    return { ok: true };
  });
}

// src/index.ts
var app = Fastify({ logger: { level: "info" } });
await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
});
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 5 } });
app.get("/health", async () => ({ ok: true, ts: Date.now() }));
app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));
app.get("/ws", { websocket: true }, (conn) => {
  const ws = conn.socket ?? conn;
  addClient(ws);
});
await app.register(projectRoutes);
await app.register(testCaseRoutes);
await app.register(scriptRoutes);
await app.register(runRoutes);
await app.register(settingsRoutes);
await app.register(generateRoutes);
await app.register(recordRoutes);
await app.register(loginConfigRoutes);
await app.register(attachmentRoutes);
await app.register(locatorRoutes);
await app.register(generationLogRoutes);
await app.register(pluginRoutes);
ensureBuiltinPlugins().catch((e) => console.warn("[pluginStore] \u5185\u7F6E\u63D2\u4EF6 seed \u5931\u8D25:", e));
pruneExpired(getConfig().generationLogRetentionDays).catch(
  (e) => console.warn("[genLog] \u542F\u52A8\u6E05\u7406\u5931\u8D25:", e)
);
var port = Number(process.env.PORT ?? 4123);
await app.listen({ port, host: "127.0.0.1" });
console.log(`[backend] \u540E\u7AEF\u5DF2\u542F\u52A8\uFF1Ahttp://127.0.0.1:${port}`);
