// src/project/detectors/backend.ts
import type { SignalContext } from './context.js'
import type { BackendMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

interface FrameworkSig {
  readonly dep: string
  readonly kind: 'npm' | 'py' | 'cargo' | 'go'
  readonly listenPatterns: readonly string[]
  readonly entryFiles: readonly string[]
  readonly routesDirs: readonly string[]
}

const FRAMEWORKS: readonly FrameworkSig[] = [
  // Node
  {
    dep: 'express', kind: 'npm',
    listenPatterns: ['.listen(', 'createServer('],
    entryFiles: ['src/index.ts', 'src/server.ts', 'src/main.ts', 'index.js', 'server.js'],
    routesDirs: ['src/routes', 'routes', 'src/api', 'app/api'],
  },
  {
    dep: 'fastify', kind: 'npm',
    listenPatterns: ['.listen(', 'fastify.listen'],
    entryFiles: ['src/index.ts', 'src/server.ts'],
    routesDirs: ['src/routes', 'routes'],
  },
  {
    dep: '@nestjs/core', kind: 'npm',
    listenPatterns: ['app.listen(', 'bootstrap('],
    entryFiles: ['src/main.ts'],
    routesDirs: ['src/modules', 'src/controllers'],
  },
  {
    dep: 'koa', kind: 'npm',
    listenPatterns: ['.listen(', 'app.listen'],
    entryFiles: ['src/index.ts', 'src/app.ts'],
    routesDirs: ['src/routes'],
  },
  {
    dep: 'hono', kind: 'npm',
    listenPatterns: ['serve(', 'Hono('],
    entryFiles: ['src/index.ts'],
    routesDirs: ['src/routes'],
  },
  // Python
  {
    dep: 'django', kind: 'py',
    listenPatterns: ['runserver', 'WSGIHandler', 'ASGIHandler'],
    entryFiles: ['manage.py', 'wsgi.py', 'asgi.py'],
    routesDirs: [],
  },
  {
    dep: 'fastapi', kind: 'py',
    listenPatterns: ['uvicorn.run(', 'FastAPI('],
    entryFiles: ['main.py', 'app.py', 'src/main.py'],
    routesDirs: ['routers', 'app/routers'],
  },
  {
    dep: 'flask', kind: 'py',
    listenPatterns: ['app.run(', 'Flask(__name__)'],
    entryFiles: ['app.py', 'main.py', 'wsgi.py'],
    routesDirs: ['routes', 'app/routes'],
  },
  // Go
  {
    dep: 'github.com/gin-gonic/gin', kind: 'go',
    listenPatterns: ['r.Run(', 'gin.Default(', '.Run(":'],
    entryFiles: ['cmd/server/main.go', 'cmd/api/main.go', 'main.go'],
    routesDirs: ['internal/routes', 'internal/handlers'],
  },
  {
    dep: 'github.com/labstack/echo', kind: 'go',
    listenPatterns: ['e.Start(', 'echo.New('],
    entryFiles: ['cmd/server/main.go', 'main.go'],
    routesDirs: ['internal/handlers'],
  },
  // Rust
  {
    dep: 'actix-web', kind: 'cargo',
    listenPatterns: ['HttpServer::new(', '.bind('],
    entryFiles: ['src/main.rs'],
    routesDirs: ['src/routes', 'src/handlers'],
  },
  {
    dep: 'axum', kind: 'cargo',
    listenPatterns: ['axum::serve(', 'Router::new('],
    entryFiles: ['src/main.rs'],
    routesDirs: ['src/routes'],
  },
  {
    dep: 'rocket', kind: 'cargo',
    listenPatterns: ['.launch()', '#[launch]'],
    entryFiles: ['src/main.rs'],
    routesDirs: ['src/routes'],
  },
]

export function detectBackend(ctx: SignalContext): BackendMatch | null {
  // Find any framework dep
  let matched: { fw: FrameworkSig; routes: boolean; entry: boolean } | null = null
  for (const fw of FRAMEWORKS) {
    if (!ctx.hasDep(fw.dep, fw.kind)) continue
    const routes = fw.routesDirs.some(d => ctx.dirExists(d))
    let entry = false
    for (const ef of fw.entryFiles) {
      const text = ctx.readFileText(ef)
      if (text && fw.listenPatterns.some(p => text.includes(p))) {
        entry = true
        break
      }
    }
    matched = { fw, routes, entry }
    break
  }
  if (!matched) return null

  const manifestFile = matched.fw.kind === 'npm' ? 'package.json'
    : matched.fw.kind === 'py' ? 'pyproject.toml'
      : matched.fw.kind === 'cargo' ? 'Cargo.toml'
        : 'go.mod'
  const ev: DetectionEvidence[] = [evidence(`${matched.fw.dep}-dep`, manifestFile)]

  // Tier
  let confidence: 'high' | 'medium' | 'low'
  if (matched.routes) {
    confidence = 'high'
    ev.push(evidence('routes-dir'))
  } else if (matched.entry) {
    confidence = 'medium'
    ev.push(evidence('listen-call'))
  } else {
    confidence = 'low'
  }

  // apiStyle
  let apiStyle: BackendMatch['partialConfig']['apiStyle']
  if (ctx.hasAnyDep(['@apollo/server', 'apollo-server', 'graphql-yoga'], 'npm')
    || ctx.hasDep('strawberry-graphql', 'py')) {
    apiStyle = 'graphql'
  } else if (ctx.hasDep('@trpc/server', 'npm')) {
    apiStyle = 'trpc'
  } else if (ctx.hasAnyDep(['@grpc/grpc-js', 'grpc'], 'npm')
    || ctx.hasDep('grpcio', 'py')
    || ctx.hasDep('google.golang.org/grpc', 'go')) {
    apiStyle = 'grpc'
  } else {
    apiStyle = 'rest'
  }

  // dataStore — redis is cache unless sole signal
  const relDeps = [
    'pg', 'postgres', 'mysql2', 'mariadb', 'better-sqlite3',
    'sqlite3', 'prisma', 'drizzle-orm', 'typeorm', 'knex',
  ]
  const hasRel = ctx.hasAnyDep(relDeps, 'npm')
    || ctx.hasAnyDep(['psycopg', 'psycopg2', 'sqlalchemy', 'asyncpg', 'mysqlclient'], 'py')
  const hasDoc = ctx.hasAnyDep(['mongodb', 'mongoose'], 'npm')
    || ctx.hasAnyDep(['pymongo', 'motor'], 'py')
  const hasKv = ctx.hasAnyDep(['redis', 'ioredis'], 'npm')
    || ctx.hasDep('redis', 'py')
  const stores: BackendMatch['partialConfig']['dataStore'] = []
  if (hasRel) stores.push('relational')
  if (hasDoc) stores.push('document')
  if (hasKv && !hasRel && !hasDoc) stores.push('key-value')

  // authMechanism
  let authMechanism: BackendMatch['partialConfig']['authMechanism'] | undefined
  if (ctx.hasAnyDep(['jsonwebtoken', '@nestjs/jwt', 'jose'], 'npm')) {
    authMechanism = 'jwt'
  } else if (ctx.hasAnyDep(['passport', 'express-session'], 'npm')) {
    authMechanism = 'session'
  } else if (ctx.hasAnyDep(['passport-oauth2'], 'npm')) {
    authMechanism = 'oauth'
  }

  // asyncMessaging
  let asyncMessaging: BackendMatch['partialConfig']['asyncMessaging'] | undefined
  const hasQueue = ctx.hasAnyDep(['bullmq', 'bull', 'bee-queue'], 'npm')
    || ctx.hasAnyDep(['celery', 'rq'], 'py')
  const hasEvents = ctx.hasAnyDep(
    ['kafkajs', '@confluentinc/kafka-javascript', 'amqplib', 'nats'], 'npm',
  ) || ctx.hasAnyDep(['confluent-kafka', 'pika'], 'py')
  if (hasQueue) asyncMessaging = 'queue'
  else if (hasEvents) asyncMessaging = 'event-driven'

  // deployTarget
  let deployTarget: BackendMatch['partialConfig']['deployTarget'] | undefined
  if (ctx.hasFile('Dockerfile') || ctx.hasFile('docker-compose.yml')) {
    deployTarget = 'container'
  }
  if (ctx.hasFile('serverless.yml') || ctx.hasFile('sam.yaml')
    || ctx.hasDep('mangum', 'py')) {
    deployTarget = 'serverless'
  }

  const partialConfig: BackendMatch['partialConfig'] = { apiStyle }
  if (stores.length > 0) partialConfig.dataStore = stores
  if (authMechanism) partialConfig.authMechanism = authMechanism
  if (asyncMessaging) partialConfig.asyncMessaging = asyncMessaging
  if (deployTarget) partialConfig.deployTarget = deployTarget

  return { projectType: 'backend', confidence, partialConfig, evidence: ev }
}
