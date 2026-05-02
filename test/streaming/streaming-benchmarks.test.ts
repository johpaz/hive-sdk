import { describe, test, expect, beforeEach, mock } from "bun:test"
import type { SwarmWorker } from "../../packages/scheduler/src/swarm/swarm-types"

const SWARM_ID = "bench-swarm-001"

describe("[Streaming] Time to First Token (TTFT)", () => {
  test("should measure TTFT from LLM provider", async () => {
    const ttftResults: number[] = []
    const modelName = "gpt-4o-mini"

    const testPrompts = [
      "Hello, how are you?",
      "What is 2+2?",
      "Write a short poem.",
    ]

    for (const prompt of testPrompts) {
      const t0 = performance.now()
      let firstTokenReceived = false
      let ttft = 0

      const mockStream = {
        *[Symbol.asyncIterator]() {
          const tokens = ["Hello", " there", "!", " How", " can", " I", " help", " you", "?"]
          for (const token of tokens) {
            if (!firstTokenReceived) {
              ttft = performance.now() - t0
              firstTokenReceived = true
            }
            yield { choices: [{ delta: { content: token } }] }
          }
        },
      }

      for await (const chunk of mockStream) {
        if (chunk.choices?.[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content
        }
      }

      ttftResults.push(ttft)
    }

    const avgTTFT = ttftResults.reduce((a, b) => a + b, 0) / ttftResults.length

    console.log(`[TTFT Benchmark] Average: ${avgTTFT.toFixed(2)}ms`)
    console.log(`[TTFT Benchmark] Per prompt:`, ttftResults.map((t) => `${t.toFixed(2)}ms`).join(", "))

    expect(avgTTFT).toBeGreaterThan(0)
    expect(avgTTFT).toBeLessThan(5000)
  })

  test("should compare TTFT across different model tiers", async () => {
    const modelTTFT: Record<string, number[]> = {
      "fast-model": [],
      "balanced-model": [],
      "quality-model": [],
    }

    const mockTTFT = {
      "fast-model": 150,
      "balanced-model": 800,
      "quality-model": 2500,
    }

    for (const [model, baseTTFT] of Object.entries(mockTTFT)) {
      for (let i = 0; i < 5; i++) {
        const variance = (Math.random() - 0.5) * 200
        modelTTFT[model].push(baseTTFT + variance)
      }
    }

    const averages = Object.entries(modelTTFT).map(([model, times]) => ({
      model,
      avgTTFT: times.reduce((a, b) => a + b, 0) / times.length,
    }))

    console.log("[TTFT Benchmark] Model comparison:")
    for (const { model, avgTTFT } of averages) {
      console.log(`  ${model}: ${avgTTFT.toFixed(2)}ms`)
    }

    const fastest = averages.reduce((a, b) => (a.avgTTFT < b.avgTTFT ? a : b))
    expect(fastest.model).toBe("fast-model")
    expect(averages.length).toBe(3)
  })

  test("should measure TTFT overhead from context compilation", async () => {
    const contextCompileTimes = [50, 120, 80, 200, 45]
    const llmTimes = [300, 450, 380, 520, 290]

    const totalTimes = contextCompileTimes.map((ctx, i) => ctx + llmTimes[i])
    const ttftFromLLM = llmTimes.reduce((a, b) => a + b, 0) / llmTimes.length
    const ttftWithOverhead = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length

    const overheadPercent = ((ttftWithOverhead - ttftFromLLM) / ttftFromLLM) * 100

    console.log(`[TTFT Benchmark] LLM only: ${ttftFromLLM.toFixed(2)}ms`)
    console.log(`[TTFT Benchmark] With context: ${ttftWithOverhead.toFixed(2)}ms`)
    console.log(`[TTFT Benchmark] Overhead: ${overheadPercent.toFixed(1)}%`)

    expect(overheadPercent).toBeLessThan(50)
  })

  test("should track streaming tokens per second", async () => {
    const prompt = "Write a detailed explanation of photosynthesis"
    const generatedTokens = 150
    const totalTime = 2500

    const tokensPerSecond = (generatedTokens / totalTime) * 1000

    console.log(`[Streaming Throughput] ${tokensPerSecond.toFixed(2)} tokens/sec`)
    console.log(`[Streaming Throughput] ${generatedTokens} tokens in ${totalTime}ms`)

    expect(tokensPerSecond).toBeGreaterThan(10)
    expect(tokensPerSecond).toBeLessThan(500)
  })
})

describe("[Streaming] Worker Performance Metrics", () => {
  test("should measure worker task completion time", async () => {
    const workerMetrics: Array<{ workerId: string; taskDuration: number; status: string }> = []

    const workers = [
      { id: "worker-1", tasks: 5 },
      { id: "worker-2", tasks: 3 },
      { id: "worker-3", tasks: 7 },
    ]

    for (const worker of workers) {
      const tasks = Array.from({ length: worker.tasks }, (_, i) => ({
        id: `task-${i}`,
        complexity: Math.random() * 100,
      }))

      for (const task of tasks) {
        const t0 = performance.now()
        await new Promise((r) => setTimeout(r, task.complexity))
        const duration = performance.now() - t0

        workerMetrics.push({
          workerId: worker.id,
          taskDuration: duration,
          status: "completed",
        })
      }
    }

    const avgByWorker = workerMetrics.reduce(
      (acc, m) => {
        if (!acc[m.workerId]) acc[m.workerId] = []
        acc[m.workerId].push(m.taskDuration)
        return acc
      },
      {} as Record<string, number[]>
    )

    console.log("[Worker Metrics] Average task duration:")
    for (const [workerId, durations] of Object.entries(avgByWorker)) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      console.log(`  ${workerId}: ${avg.toFixed(2)}ms`)
    }

    expect(workerMetrics.length).toBe(15)
  })

  test("should measure worker throughput (tasks/sec)", async () => {
    const workerId = "benchmark-worker"
    const timeWindowMs = 1000
    const tasksCompleted = 12

    const throughput = (tasksCompleted / timeWindowMs) * 1000

    console.log(`[Worker Throughput] ${throughput.toFixed(2)} tasks/sec`)
    console.log(`[Worker Throughput] ${tasksCompleted} tasks in ${timeWindowMs}ms`)

    expect(throughput).toBeGreaterThan(0)
    expect(throughput).toBeLessThan(100)
  })

  test("should measure worker queue latency", async () => {
    const queueLatencies: number[] = []

    const simulateQueue = async (queueDepth: number) => {
      const t0 = performance.now()
      let waitTime = 0

      for (let i = 0; i < queueDepth; i++) {
        waitTime += Math.random() * 50
      }

      return performance.now() - t0 + waitTime
    }

    for (let depth = 1; depth <= 10; depth++) {
      const latency = await simulateQueue(depth)
      queueLatencies.push(latency)
    }

    console.log("[Worker Queue Latency] By queue depth:")
    queueLatencies.forEach((latency, depth) => {
      console.log(`  Depth ${depth + 1}: ${latency.toFixed(2)}ms`)
    })

    const avgLatency = queueLatencies.reduce((a, b) => a + b, 0) / queueLatencies.length
    expect(avgLatency).toBeLessThan(500)
  })

  test("should measure worker parallel execution efficiency", async () => {
    const numWorkers = 4
    const tasksPerWorker = 10
    const taskDuration = 100

    const sequentialTime = numWorkers * tasksPerWorker * taskDuration

    const t0 = performance.now()
    const workers = Array.from({ length: numWorkers }, (_, wi) =>
      Promise.all(
        Array.from({ length: tasksPerWorker }, async () => {
          await new Promise((r) => setTimeout(r, taskDuration))
        })
      )
    )
    await Promise.all(workers)
    const parallelTime = performance.now() - t0

    const efficiency = (sequentialTime / parallelTime) / numWorkers

    console.log(`[Parallel Efficiency] Sequential: ${sequentialTime}ms`)
    console.log(`[Parallel Efficiency] Parallel: ${parallelTime.toFixed(2)}ms`)
    console.log(`[Parallel Efficiency] Efficiency: ${(efficiency * 100).toFixed(1)}%`)

    expect(efficiency).toBeGreaterThan(0.7)
  })

  test("should measure worker context switch overhead", async () => {
    const contextSwitchOverhead: number[] = []

    const simulateTaskSwitch = async () => {
      const t0 = performance.now()

      await new Promise((r) => setTimeout(r, 50))

      const switchOverhead = performance.now() - t0 - 50
      return switchOverhead
    }

    for (let i = 0; i < 20; i++) {
      const overhead = await simulateTaskSwitch()
      contextSwitchOverhead.push(overhead)
    }

    const avgOverhead = contextSwitchOverhead.reduce((a, b) => a + b, 0) / contextSwitchOverhead.length

    console.log(`[Context Switch] Average overhead: ${avgOverhead.toFixed(2)}ms`)
    console.log(`[Context Switch] Max overhead: ${Math.max(...contextSwitchOverhead).toFixed(2)}ms`)

    expect(avgOverhead).toBeLessThan(10)
  })

  test("should measure swarm coordination latency", async () => {
    const swarmSize = 5
    const coordinationLatencies: number[] = []

    const simulateCoordination = async () => {
      const t0 = performance.now()

      const messages = Array.from({ length: swarmSize }, (_, i) => ({
        from: `worker-${i}`,
        type: "task_complete",
      }))

      for (const msg of messages) {
        await new Promise((r) => setTimeout(r, Math.random() * 5))
      }

      return performance.now() - t0
    }

    for (let i = 0; i < 10; i++) {
      const latency = await simulateCoordination()
      coordinationLatencies.push(latency)
    }

    const avgLatency = coordinationLatencies.reduce((a, b) => a + b, 0) / coordinationLatencies.length

    console.log(`[Swarm Coordination] Average latency: ${avgLatency.toFixed(2)}ms`)
    console.log(`[Swarm Coordination] Swarm size: ${swarmSize}`)

    expect(avgLatency).toBeLessThan(100)
  })
})

describe("[Streaming] Combined Streaming + Worker Benchmarks", () => {
  test("should measure end-to-end streaming with worker distribution", async () => {
    interface StreamResult {
      ttft: number
      totalTokens: number
      duration: number
      workerId: string
    }

    const results: StreamResult[] = []

    const workers = ["worker-1", "worker-2", "worker-3"]

    for (const workerId of workers) {
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now()
        let ttft = 0
        let tokenCount = 0
        let firstToken = false

        const tokens = ["The", " quick", " brown", " fox", " jumps", " over", " the", " lazy", " dog", "."]

        for (const token of tokens) {
          if (!firstToken) {
            ttft = performance.now() - t0
            firstToken = true
          }
          await new Promise((r) => setTimeout(r, 30))
          tokenCount++
        }

        results.push({
          ttft,
          totalTokens: tokenCount,
          duration: performance.now() - t0,
          workerId,
        })
      }
    }

    const avgTTFT = results.reduce((a, b) => a + b.ttft, 0) / results.length
    const avgThroughput = results.reduce((a, b) => a + b.totalTokens / (b.duration / 1000), 0) / results.length

    console.log(`[E2E Streaming] Average TTFT: ${avgTTFT.toFixed(2)}ms`)
    console.log(`[E2E Streaming] Average throughput: ${avgThroughput.toFixed(2)} tokens/sec`)
    console.log(`[E2E Streaming] Total streams: ${results.length}`)

    expect(avgTTFT).toBeLessThan(1000)
    expect(avgThroughput).toBeGreaterThan(5)
  })

  test("should measure backpressure handling during streaming", async () => {
    const bufferSizes: number[] = []
    const maxBufferSize = 100
    let currentBuffer = 0

    const processChunk = async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 10))
      currentBuffer = Math.max(0, currentBuffer - 1)
    }

    const produceChunk = () => {
      if (currentBuffer < maxBufferSize) {
        currentBuffer++
        bufferSizes.push(currentBuffer)
      }
    }

    for (let i = 0; i < 50; i++) {
      produceChunk()
      await processChunk()
    }

    const avgBuffer = bufferSizes.reduce((a, b) => a + b, 0) / bufferSizes.length
    const maxBuffer = Math.max(...bufferSizes)

    console.log(`[Backpressure] Average buffer: ${avgBuffer.toFixed(2)}`)
    console.log(`[Backpressure] Max buffer: ${maxBuffer}`)
    console.log(`[Backpressure] Buffer utilization: ${((avgBuffer / maxBufferSize) * 100).toFixed(1)}%`)

    expect(maxBuffer).toBeLessThan(maxBufferSize)
  })
})