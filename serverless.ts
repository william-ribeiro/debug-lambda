/* eslint-disable @typescript-eslint/no-explicit-any */

import 'dotenv/config'
import { APIGatewayProxyHandler } from 'aws-lambda'
import fastifyCors from '@fastify/cors'
import multerS3 from 'multer-s3'
import { S3Client } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import fastifyMulter from 'fastify-multer'
import fastify, { FastifyRequest, RouteHandlerMethod } from 'fastify'
import awsLambdaFastify from '@fastify/aws-lambda'

const server = fastify({ logger: true })

server.register(fastifyMulter.contentParser)
server.register(fastifyCors)

server.get('/ping_', async (request, reply) => {
  const startTime = performance.now()
  try {
    const body = JSON.stringify({
      uptime: process.uptime(),
      responseTime: `${((performance.now() - startTime) / 1000) % 60}  segundos`,
      message: 'pong_',
      timestamp: new Date().getMilliseconds(),
    })

    reply.send({ body })
  } catch (error) {
    reply.status(500).send({ error: 'PING_Internal Server Error' })
  }
})

const client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

interface FileWithFilename extends Express.Multer.File {
  filename: string
}

const storage = multerS3({
  s3: client,
  bucket: 'teste-git-sls',
  contentType(req, file: FileWithFilename, callback) {
    callback(null, file.mimetype)
  },
  key: (
    req: any,
    file: FileWithFilename,
    cb: (error: any, key?: string) => void,
  ) => {
    randomBytes(16, (err, hash) => {
      if (err) {
        cb(err)
      }
      const filename = `${hash.toString('hex')}-${file.originalname}`
      cb(null, filename)
    })
  },
})

const multer = fastifyMulter({
  storage: storage as any,

  fileFilter: (
    _request: FastifyRequest,
    file: any,
    callback: (arg0: Error, arg1: boolean) => void,
  ) => {
    const allowedMimes = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/gif']

    if (allowedMimes.includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('Invalid file type.'), false)
    }
  },
})

server.post(
  '/post',
  { preHandler: [multer.single('file') as RouteHandlerMethod] },
  async (req, reply) => {
    try {
      console.log(process.env.AWS_ACCESS_KEY_ID)
      const File = (req as any).file
      console.log('file', File)
      const body = JSON.stringify({
        url: File,
      })

      reply.status(201).send({ body })
    } catch (error) {
      console.log('error', error)
    }
  },
)

const proxy = awsLambdaFastify(server)

export const handler: APIGatewayProxyHandler = async (event, context) => {
  try {
    const result = await proxy(event, context)

    console.log('res', result.body)
    const { statusCode, body } = JSON.parse(result.body)
    return {
      statusCode,
      body,
    }
  } catch (error) {
    console.log({ error })
    return {
      statusCode: 500,
      body: JSON.stringify({ error }),
    }
  }
}
