import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval, Timeout } from '@nestjs/schedule';
import S3 from 'aws-sdk/clients/s3';
import { Alchemy, Network, AlchemySubscription } from 'alchemy-sdk';
import axios from 'axios';
import fs from 'fs';
import { startStream, types } from 'near-lake-framework';
import {
  LessThanOrEqual,
  MoreThanOrEqual,
  Equal,
  Not,
  In,
  QueryBuilder,
  ArrayContains,
  QueryFailedError,
} from 'typeorm';
import convert from 'xml-js';
import moment from 'moment-timezone';
import WebSocket from 'ws';
import { Contract, ethers } from 'ethers';
import { Athlete } from '../entities/Athlete';
import { AthleteStat } from '../entities/AthleteStat';
import { Game } from '../entities/Game';
import { GameTeam } from '../entities/GameTeam';
import { GameTeamAthlete } from '../entities/GameTeamAthlete';
import { Team } from '../entities/Team';
import { Timeframe } from '../entities/Timeframe';
import { Schedule } from '../entities/Schedule';
import { CricketAuth } from '../entities/CricketAuth';
import { CricketTournament } from '../entities/CricketTournament';
import { CricketTeam } from '../entities/CricketTeam';
import { CricketAthlete } from '../entities/CricketAthlete';
import { CricketAthleteStat } from '../entities/CricketAthleteStat';
import { CricketMatch } from '../entities/CricketMatch';
import { getSeasonType } from '../helpers/Timeframe';
import { PolygonAddress } from '../entities/PolygonAddress';
import { PolygonToken } from '../entities/PolygonToken';
import {
  ATHLETE_MLB_BASE_ANIMATION,
  ATHLETE_MLB_BASE_IMG,
  ATHLETE_MLB_IMG,
} from '../utils/svgTemplates';
import {
  AthleteStatType,
  SportType,
  SubmitLineupType,
  EventAddGameType,
  EventSubmitLineupType,
  AddGameType,
  ResponseStatus,
  SportMap,
  TokenType,
  ChainType,
} from '../utils/types';
import {
  CricketTeamInterface,
  CricketAthleteInterface,
  CricketPointsBreakup,
} from '../interfaces/Cricket';
import { NearBlock } from '../entities/NearBlock';
import { NearResponse } from '../entities/NearResponse';
import {
  NFL_ATHLETE_IDS,
  NBA_ATHLETE_IDS,
  NBA_ATHLETE_PROMO_IDS,
  MLB_ATHLETE_IDS,
  MLB_ATHLETE_PROMO_IDS,
  IPL2023_ATHLETE_IDS,
} from '../utils/athlete-ids';
import { AppDataSource } from '../utils/db';
import {
  ReceiptEnum,
  ExecutionStatus,
  FunctionCallAction,
} from 'near-lake-framework/dist/types';
import { getSportType } from '../helpers/Sport';
import { addGameHandler, submitLineupHandler } from '../helpers/EventHandler';
import { computeShoheiOhtaniScores } from '../helpers/Athlete';
import e from 'express';
import gameABI from '../utils/polygon-contract-abis/game_logic.json';
import athleteStorageABI from '../utils/polygon-contract-abis/regular_athlete_storage.json';
import promoAthleteStorageABI from '../utils/polygon-contract-abis/promo_athlete_storage.json';

@Injectable()
export class NearService {
  private readonly logger = new Logger(NearService.name);

  @Timeout(1)
  async runService() {
    this.logger.debug('Starting NEAR service');
  }
  @Timeout(1)
  async runNearLakeFrameworkIndexer() {
    const lakeConfig: types.LakeConfig = {
      //credentials
      s3BucketName: 'near-lake-data-mainnet',
      s3RegionName: 'eu-central-1',
      startBlockHeight: 119552229, // for testnet
      //startBlockHeight: 97856450//97543661//97856450, //97239921 old
    };
    const nearGameMainnetContracts = [
      'game.baseball.playible.near',
      'game.nfl.playible.near',
      'game.basketball.playible.near',
    ];
    const nearGameTestnetContracts = [
      'game.baseball.playible.testnet',
      'game.nfl.playible.testnet',
      'game.basketball.playible.testnet',
    ];
    //let currentBlockHeight = lakeConfig.startBlockHeight;
    //Function to receive responses from lake-indexer
    async function handleStreamerMessage(
      streamerMessage: types.StreamerMessage
    ): Promise<void> {
      // console.log(`
      // Block #${streamerMessage.block.header.height}
      // Shards: ${streamerMessage.shards.length
      // }`)
      //console.log(count)
      //check if current block height is existing within the database
      //currentBlockHeight = streamerMessage.block.header.height;
      const block = await NearBlock.findOne({
        where: {
          height: streamerMessage.block.header.height,
          hash: streamerMessage.block.header.hash,
        },
      });
      //console.log(streamerMessage.block.header.height);
      if (!block) {
        //console.log(`Response array length ${nearResponses.length}`)
        for (let shard of streamerMessage.shards) {
          if (shard.chunk !== undefined && shard.chunk !== null) {
            let filteredReceipts = shard.receiptExecutionOutcomes.filter(
              (x) =>
                nearGameMainnetContracts.includes(
                  x.executionOutcome.outcome.executorId
                )
              // x.executionOutcome.outcome.executorId ===
              // 'game.baseball.playible.near'
            );

            if (filteredReceipts.length > 0) {
              Logger.debug('Found playible receipt');

              for (let receipt of filteredReceipts) {
                if (
                  receipt.receipt !== null &&
                  'Action' in receipt.receipt.receipt
                ) {
                  console.log(receipt.receipt.receipt.Action.actions[0]);
                  let object: FunctionCallAction = JSON.parse(
                    JSON.stringify(receipt.receipt.receipt.Action.actions[0])
                  );
                  if (object.FunctionCall.methodName === 'add_game') {
                    // const object: EventAddGameType = JSON.parse(JSON.stringify(receipt.executionOutcome.outcome.logs[0]))
                    // console.log(object.EVENT_JSON.event)
                    console.log(receipt.executionOutcome.outcome.logs[0]);
                    if (
                      receipt.executionOutcome.outcome.logs[0] !== undefined
                    ) {
                      const event: EventAddGameType = JSON.parse(
                        receipt.executionOutcome.outcome.logs[0].substring(11)
                      );
                      const sport = getSportType(
                        receipt.executionOutcome.outcome.executorId
                      );

                      let success = await addGameHandler(event, sport);

                      if (success) {
                        let nearBlock = await NearBlock.create({
                          height: streamerMessage.block.header.height,
                          hash: streamerMessage.block.header.hash,
                          timestamp: moment().utc(),
                        });

                        let saveResponse = await NearResponse.create({
                          receiverId: receipt.receipt.receiverId,
                          signerId: receipt.receipt.predecessorId,
                          receiptIds: [receipt.receipt.receiptId],
                          methodName: object.FunctionCall.methodName,
                          status: ResponseStatus.SUCCESS,
                        });

                        nearBlock.nearResponse = saveResponse;
                        await NearBlock.save(nearBlock);
                        Logger.debug(
                          `Successfully created Block ${streamerMessage.block.header.height} for ${object.FunctionCall.methodName} call`
                        );
                      }
                    } else {
                      Logger.debug(
                        `No logs found for NEAR receipt at ${streamerMessage.block.header.height}`
                      );
                    }
                  } else if (
                    object.FunctionCall.methodName ===
                    'submit_lineup_result_callbacks'
                  ) {
                    //console.log(receipt.executionOutcome.outcome.logs)
                    console.log(receipt.executionOutcome.outcome.logs);
                    if (
                      receipt.executionOutcome.outcome.logs[0] !== undefined
                    ) {
                      const event: EventSubmitLineupType = JSON.parse(
                        receipt.executionOutcome.outcome.logs[0].substring(11)
                      );
                      const sport = getSportType(
                        receipt.executionOutcome.outcome.executorId
                      );

                      let success = await submitLineupHandler(event, sport);

                      if (success) {
                        let nearBlock = await NearBlock.create({
                          height: streamerMessage.block.header.height,
                          hash: streamerMessage.block.header.hash,
                          timestamp: moment().utc(),
                        });
                        let saveResponse = await NearResponse.create({
                          receiverId: receipt.receipt.receiverId,
                          signerId: event.data[0].signer,
                          receiptIds: [receipt.receipt.receiptId],
                          methodName: event.event,
                          status: ResponseStatus.SUCCESS,
                        });
                        nearBlock.nearResponse = saveResponse;
                        await NearBlock.save(nearBlock);
                        Logger.debug(
                          `Successfully created Block ${streamerMessage.block.header.height} for ${object.FunctionCall.methodName} call`
                        );
                      }
                    } else {
                      Logger.debug(
                        `No logs found for NEAR receipt at ${streamerMessage.block.header.height}`
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        console.log('Block already exists.');
      }
    }

    try {
      console.log('Start NEAR Lake Indexer');
      await startStream(lakeConfig, handleStreamerMessage);
    } catch (e) {
      console.log('Lake Indexer encountered an error.');
      console.log(e);
    }
  }
}
