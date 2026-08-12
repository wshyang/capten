import { parentPort } from 'worker_threads';
import * as tf from '@tensorflow/tfjs';
import {
  createCNNModel,
  createCNNModelFromCheckpoint,
  exportModelCheckpoint,
  mutateModelWeights,
  trainCNNModel,
  generateSelfPlayTrainingData,
} from './index';
import { evalVsD4_50Sync, matchNNvsNN, runNNvsNNGame } from './tournament32';

if (parentPort) {
  parentPort.on('message', async (task: any) => {
    try {
      if (task.type === 'EVAL_VS_D4') {
        const model = createCNNModelFromCheckpoint(task.modelCheckpoint);

        const res = evalVsD4_50Sync(
          model,
          task.seeds,
          task.rounds,
          task.mctsIters || 50,
          task.mctsDepth || 4
        );
        model.dispose();
        tf.disposeVariables();

        parentPort?.postMessage({ status: 'SUCCESS', result: res });
      } else if (task.type === 'GENERATE_SELF_PLAY') {
        const samples = await generateSelfPlayTrainingData(
          task.count,
          task.seed,
          task.mctsIters,
          task.mctsDepth,
          task.numChannels || 32
        );
        const serialized = samples.map((s: any) => ({
          stateTensor: Array.from(s.stateTensor),
          policyTarget: Array.from(s.policyTarget),
          valueTarget: s.valueTarget,
        }));
        parentPort?.postMessage({ status: 'SUCCESS', result: serialized });
      } else if (task.type === 'EVAL_NN_VS_NN_SYMMETRIC') {
        const candModel = createCNNModelFromCheckpoint(task.candCheckpoint);
        const champModel = createCNNModelFromCheckpoint(task.champCheckpoint);

        let w = 0, l = 0, d = 0;
        for (const seed of task.baseSeeds) {
          const res1 = runNNvsNNGame(candModel, champModel, seed, task.rounds);
          if (res1.winner === 'A') w++;
          else if (res1.winner === 'B') l++;
          else d++;

          const res2 = runNNvsNNGame(champModel, candModel, seed, task.rounds);
          if (res2.winner === 'B') w++;
          else if (res2.winner === 'A') l++;
          else d++;
        }
        candModel.dispose();
        champModel.dispose();
        tf.disposeVariables();
        parentPort?.postMessage({ status: 'SUCCESS', result: { w, l, d } });
      } else if (task.type === 'TRAIN_INSTANCE') {
        const { instanceIndex, baseCheckpoint, config } = task;
        const instKey = `pop_${instanceIndex}`;
        const instModel = baseCheckpoint ? createCNNModelFromCheckpoint(baseCheckpoint) : createCNNModel([11, 11, 32]);

        mutateModelWeights(instModel, 1.0, 0.02 + (instanceIndex % 5) * 0.01);

        const instSamples = await generateSelfPlayTrainingData(
          config.instSamples,
          2000 + instanceIndex * 100,
          config.mctsIters,
          config.mctsDepth
        );
        await trainCNNModel(instModel, instSamples, config.instEpochs, 8);

        let instEval = evalVsD4_50Sync(instModel, config.evalMatches, config.tournamentRounds);
        let retries = 0;
        while (instEval.winRate < config.targetWinRate && retries < 5) {
          retries++;
          const extraSamples = await generateSelfPlayTrainingData(
            config.instSamples,
            5000 + instanceIndex * 10 + retries,
            config.mctsIters,
            config.mctsDepth
          );
          await trainCNNModel(instModel, extraSamples, config.instEpochs, 8);
          instEval = evalVsD4_50Sync(instModel, config.evalMatches, config.tournamentRounds);
        }

        const ckpt = exportModelCheckpoint(instModel, 1, instEval.winRate);
        instModel.dispose();

        parentPort?.postMessage({
          status: 'SUCCESS',
          result: {
            instanceIndex,
            instKey,
            checkpoint: ckpt,
            winRate: instEval.winRate,
            w: instEval.w,
            l: instEval.l,
            d: instEval.d,
          },
        });
      } else if (task.type === 'MATCH_VS_POOL_CHUNK') {
        const { candidateCheckpoint, defenders, rounds } = task;
        const candidateModel = createCNNModelFromCheckpoint(candidateCheckpoint);

        let poolWins = 0;
        let poolLosses = 0;
        let poolDraws = 0;
        const defeatedKeys: string[] = [];
        const unbeatenKeys: string[] = [];

        for (const def of defenders) {
          if (def.isSelf) {
            poolWins++;
            defeatedKeys.push(def.defKey);
            continue;
          }

          const defenderModel = createCNNModelFromCheckpoint(def.checkpoint);

          const matchRes = matchNNvsNN(candidateModel, defenderModel, def.seed, rounds);
          defenderModel.dispose();

          if (matchRes.winA) {
            poolWins++;
            defeatedKeys.push(def.defKey);
          } else {
            if (matchRes.draw) poolDraws++;
            else poolLosses++;
            unbeatenKeys.push(def.defKey);
          }
        }

        candidateModel.dispose();
        parentPort?.postMessage({
          status: 'SUCCESS',
          result: {
            poolWins,
            poolLosses,
            poolDraws,
            defeatedKeys,
            unbeatenKeys,
          },
        });
      } else {
        throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (err: any) {
      parentPort?.postMessage({
        status: 'ERROR',
        error: err?.message || String(err),
      });
    }
  });
}
