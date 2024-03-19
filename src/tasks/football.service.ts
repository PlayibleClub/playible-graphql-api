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
export class FootballService {
  private readonly logger = new Logger(FootballService.name);

  @Timeout(1)
  async runService() {
    this.logger.debug('Starting football service');
  }
  //@Timeout(1)
  async runPolygonMainnetNFLAthleteWebSocketListener() {
    function listenToAthleteStorage() {
      let logger = new Logger('NFLAthleteStorage');
      console.log('Start polygon athlete listen');
      const network = 'matic'; // dont forget to change to polygon mainnet
      const athleteStorage = athleteStorageABI;
      const provider = new ethers.AlchemyProvider(
        network,
        process.env.ALCHEMY_POLYGON_API_KEY
      );

      provider.pollingInterval = 20000;

      const athleteStorageContract = new Contract(
        process.env.POLYGON_ATHLETE_STORAGE_ADDRESS ?? 'contract',
        athleteStorage,
        provider
      );

      //receive tokensMinted, add address to entity if unique, push tokenIds if not existing
      try {
        athleteStorageContract.on(
          'TokensMinted',
          async (ownerAddress, tokens, event) => {
            console.log(`Receiver address: ${ownerAddress}`);
            console.log(tokens);
            console.log(event.log);

            const polygonAddress = await PolygonAddress.findOne({
              where: {
                address: ownerAddress,
              },
            });
            if (polygonAddress) {
              for (let token of tokens) {
                const addToken = await PolygonToken.findOne({
                  where: {
                    tokenId: Number(token),
                    sport: SportType.NFL,
                    polygonAddress: {
                      address: ownerAddress,
                    },
                  },
                });
                if (addToken) {
                  logger.error(
                    `FAILURE THIS SHOULD NOT HAPPEN Token ${Number(
                      token
                    )} already exists for ${ownerAddress}`
                  );
                } else {
                  await PolygonToken.create({
                    tokenId: Number(token),
                    sport: SportType.NFL,
                    polygonAddress: polygonAddress,
                    type: TokenType.REG,
                  }).save();
                  logger.debug(
                    `Added new token ${Number(
                      token
                    )} to address ${ownerAddress}`
                  );
                }
              }
            } else {
              const newAddress = await PolygonAddress.create({
                address: ownerAddress,
              }).save();

              for (let token of tokens) {
                const addToken = await PolygonToken.findOne({
                  where: {
                    tokenId: Number(token),
                    sport: SportType.NFL,
                    polygonAddress: {
                      address: ownerAddress,
                    },
                  },
                });
                if (addToken) {
                  logger.error(
                    `FAILURE Token ${Number(
                      token
                    )} already exists on address ${ownerAddress}`
                  );
                } else {
                  await PolygonToken.create({
                    tokenId: Number(token),
                    sport: SportType.NFL,
                    polygonAddress: newAddress,
                    type: TokenType.REG,
                  }).save();
                  logger.debug(
                    `Added new token ${Number(
                      token
                    )} to NEW address ${ownerAddress}`
                  );
                }
              }
            }
          }
        );

        athleteStorageContract.on(
          'TokenBurn',
          async (address, token, amount, event) => {
            const tempAmount = amount;
            const tempEvent = event;
            const deleteToken = await PolygonToken.findOne({
              where: {
                sport: SportType.NFL,
                tokenId: Number(token),
                polygonAddress: {
                  address: address,
                },
              },
            });

            if (deleteToken) {
              //found correct owner, with correct tokenId, and with correct sport
              await PolygonToken.remove(deleteToken);
              logger.debug(`Token ${token} burned on account ${address}`);
            } else {
              logger.error(
                `ERROR! Token ${Number(token)} not found in address ${address}`
              );
            }
          }
        );

        athleteStorageContract.on(
          'TokenBurnBatch',
          async (address, tokens, amounts, event) => {
            const tempAmounts = amounts;
            const tempEvent = event;
            for (let token of tokens) {
              const deleteToken = await PolygonToken.findOne({
                where: {
                  sport: SportType.NFL,
                  tokenId: Number(token),
                  polygonAddress: {
                    address: address,
                  },
                },
              });

              if (deleteToken) {
                //found corrent owner, with correct tokenId, and with correct sport
                await PolygonToken.remove(deleteToken);
                logger.debug(`Token ${token} burned on account ${address}`);
              } else {
                logger.error(
                  `ERROR! Token ${Number(
                    token
                  )} not found in address ${address} in Burn BATCH`
                );
              }
            }
          }
        );
        athleteStorageContract.on(
          'TokenTransfer',
          async (fromAddr, toAddr, token) => {
            logger.debug(`Start single transfer from ${fromAddr} to ${toAddr}`);
            const transferToken = await PolygonToken.findOne({
              where: {
                sport: SportType.NFL,
                tokenId: Number(token),
                polygonAddress: {
                  address: fromAddr,
                },
              },
            });
            if (transferToken) {
              //token exists within fromAddress

              const receivingAddress = await PolygonAddress.findOne({
                where: {
                  address: toAddr,
                },
              });
              let success: boolean = false;
              if (receivingAddress) {
                //toAddress exists
                await PolygonToken.create({
                  sport: SportType.NFL,
                  tokenId: Number(token),
                  type: TokenType.REG,
                  polygonAddress: receivingAddress,
                }).save();
                logger.debug(
                  `Token ${token} transfered from ${fromAddr} to ${toAddr}`
                );
                success = true;
              } else {
                try {
                  const newAddress = await PolygonAddress.create({
                    address: toAddr,
                  }).save();
                  await PolygonToken.create({
                    sport: SportType.NFL,
                    tokenId: Number(token),
                    type: TokenType.REG,
                    polygonAddress: newAddress,
                  }).save();
                  logger.debug(
                    `Token ${token} transfered from ${fromAddr} to new address ${toAddr}`
                  );
                  success = true;
                } catch (e) {
                  switch (e.constructor) {
                    case QueryFailedError:
                      logger.debug(`Address exists, async issue`);
                      let code = (e as any).code;
                      logger.debug(`Code: ${code}`);
                      if (code === '23505' || code === 23505) {
                        logger.debug('Start transfer due to async issue');
                        //polygon address is existing but errors due to async
                        const receivingAddress = await PolygonAddress.findOne({
                          where: {
                            address: toAddr,
                          },
                        });
                        if (receivingAddress) {
                          await PolygonToken.create({
                            sport: SportType.NFL,
                            tokenId: Number(token),
                            type: TokenType.REG,
                            polygonAddress: receivingAddress,
                          }).save();
                          success = true;
                          logger.debug(
                            `Token ${token} transfered from ${fromAddr} to new address ${toAddr}`
                          );
                        }
                      }
                      break;
                    default:
                      logger.error(e);
                      break;
                  }
                }
              }
              if (success) {
                logger.debug(
                  `Start delete of token ${Number(token)} on ${fromAddr}`
                );

                await PolygonToken.remove(transferToken);
              }
            } else {
              logger.error('ERROR Token does not exist on from address');
            }
          }
        );
        athleteStorageContract.on(
          'TokenTransferBatch',
          async (fromAddr, toAddr, ids) => {
            logger.debug(`Start batch transfer from ${fromAddr} to ${toAddr}`);
            for (let token of ids) {
              const transferToken = await PolygonToken.findOne({
                where: {
                  sport: SportType.NFL,
                  tokenId: Number(token),
                  polygonAddress: {
                    address: fromAddr,
                  },
                },
              });
              if (transferToken) {
                //token exists within fromAddress

                const receivingAddress = await PolygonAddress.findOne({
                  where: {
                    address: toAddr,
                  },
                });
                let success: boolean = false;
                if (receivingAddress) {
                  //toAddress exists
                  await PolygonToken.create({
                    sport: SportType.NFL,
                    tokenId: Number(token),
                    type: TokenType.REG,
                    polygonAddress: receivingAddress,
                  }).save();
                  logger.debug(
                    `Token ${token} transfered from ${fromAddr} to ${toAddr}`
                  );
                  success = true;
                } else {
                  const newAddress = await PolygonAddress.create({
                    address: toAddr,
                  }).save();

                  await PolygonToken.create({
                    sport: SportType.NFL,
                    tokenId: Number(token),
                    type: TokenType.REG,
                    polygonAddress: newAddress,
                  }).save();
                  logger.debug(
                    `Token ${token} transfered from ${fromAddr} to new address ${toAddr}`
                  );
                  success = true;
                }
                if (success) {
                  logger.debug(
                    `Start delete of token ${Number(token)} on ${fromAddr}`
                  );

                  await PolygonToken.remove(transferToken);
                }
              } else {
                logger.error('ERROR Token does not exist on from address');
              }
            }
          }
        );
      } catch (error) {
        const code = (error as any).code;
        const message = (error as any).message;
        if (
          (code === '-32000' || code === -32000) &&
          message === 'filter not found'
        ) {
          logger.error(
            'Encountered an error in alchemy listeners, rerunning function to reconnect'
          );
          athleteStorageContract.removeAllListeners();
          setTimeout(() => listenToAthleteStorage(), 1000);
        }
      }
    }

    listenToAthleteStorage();
  }

  //@Timeout(1)
  async syncNflData2() {
    this.logger.debug('SYNC NFL START');
    const teamsCount = await Team.count({
      where: { sport: SportType.NFL },
    });

    if (teamsCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/scores/json/Teams?key=${process.env.SPORTS_DATA_NFL_KEY}`
      );

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team['GlobalTeamID'],
              name: team['Name'],
              key: team['Key'],
              location: team['City'],
              sport: SportType.NFL,
              primaryColor: `#${team['PrimaryColor']}`,
              secondaryColor: `#${team['SecondaryColor']}`,
            }).save();
          } catch (e) {
            this.logger.error(e);
          }
        }
      } else {
        this.logger.error('NFL Teams Data: SPORTS DATA ERROR');
      }
    }
    const athleteCount = await Athlete.count({
      where: {
        team: {
          sport: SportType.NFL,
        },
      },
    });

    if (athleteCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`
      );

      if (status === 200) {
        for (let athlete of data) {
          if (NFL_ATHLETE_IDS.includes(athlete['PlayerID'])) {
            try {
              const team = await Team.findOne({
                where: { apiId: athlete['GlobalTeamID'] },
              });

              if (team) {
                await Athlete.create({
                  apiId: athlete['PlayerID'],
                  firstName: athlete['FirstName'],
                  lastName: athlete['LastName'],
                  position: athlete['Position'],
                  jersey: athlete['Number'],
                  team,
                  isActive: athlete['Status'] === 'Active',
                  isInjured: athlete['InjuryStatus'],
                }).save();
              }
            } catch (err) {
              this.logger.error(err);
            }
          }
        }
      } else {
        this.logger.error('NFL Athlete: SPORTS DATA ERROR');
      }
    } else {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`
      );
      if (status === 200) {
        const newAthlete: Athlete[] = [];
        const updateAthlete: Athlete[] = [];

        for (let athlete of data) {
          if (NFL_ATHLETE_IDS.includes(athlete['PlayerID'])) {
            try {
              const team = await Team.findOne({
                where: { apiId: athlete['GlobalTeamID'] },
              });

              if (team) {
                const currAthlete = await Athlete.findOne({
                  where: { apiId: athlete['PlayerID'] },
                  relations: {
                    team: true,
                  },
                });

                if (currAthlete) {
                  if (currAthlete.team.apiId !== athlete['GlobalTeamID']) {
                    this.logger.debug(
                      `Athlete ${currAthlete.apiId} ${currAthlete.firstName} ${currAthlete.lastName} transfered from ${currAthlete.team.key} to ${athlete['GlobalTeamID']}`
                    );
                  }
                  currAthlete.firstName = athlete['FirstName'];
                  currAthlete.lastName = athlete['LastName'];
                  currAthlete.position =
                    athlete['Position'] !== null ? athlete['Position'] : 'N/A';
                  currAthlete.jersey = athlete['Number'];
                  currAthlete.team = team;
                  currAthlete.isActive = athlete['Status'] === 'Active';
                  updateAthlete.push(currAthlete);
                } else {
                  newAthlete.push(
                    Athlete.create({
                      apiId: athlete['PlayerID'],
                      firstName: athlete['FirstName'],
                      lastName: athlete['LastName'],
                      position:
                        athlete['Position'] !== null
                          ? athlete['Position']
                          : 'N/A',
                      jersey: athlete['Number'],
                      team,
                      isActive: athlete['Status'] === 'Active',
                      isInjured: athlete['InjuryStatus'],
                    })
                  );
                }
              }
            } catch (err) {
              this.logger.error(err);
            }
          }
        }

        await Athlete.save([...newAthlete, ...updateAthlete], { chunk: 20 });
        this.logger.debug('NFL Athlete: UPDATED');

        const athleteCount = await Athlete.count({
          where: { team: { sport: SportType.NFL } },
        });
        this.logger.debug(`CURRENT NFL ATHLETE COUNT: ${athleteCount}`);
      } else {
        this.logger.error('NFL Athlete: SPORTS DATA ERROR');
      }
    }
    this.logger.debug(
      `NFL Athlete: ${athleteCount ? ' ALREADY EXISTS' : 'SYNCED'}`
    );
  }

  //@Timeout(300000)
  async generateAthleteNflAssets() {
    this.logger.debug('Generate Athlete NFL Assets: STARTED');

    const athletes = await Athlete.find({
      where: {
        apiId: In(NFL_ATHLETE_IDS),
        team: { sport: SportType.NFL },
      },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nfl-svg-teams-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[2]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[3]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }

        result.svg.g[5].text[2]['_text'] = athlete.firstName.toUpperCase();
        result.svg.g[5].text[3]['_text'] = athlete.lastName.toUpperCase();
        result.svg.g[5].text[1]['_text'] = athlete.position.toUpperCase();
        result.svg.g[5].text[0]['_text'] = '';
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nfl-images/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, 'utf8');
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });
      const filename = `${
        athlete.apiId
      }-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`;
      const s3_location = 'media/athlete/nfl/images/';
      const fileContent = buffer;
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: 'image/svg+xml',
        CacheControl: 'no-cache',
      };

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err);
        } else {
          athlete.nftImage = data['Location'];
          await Athlete.save(athlete);
        }
      });
    }
    this.logger.debug('Generate Athlete NFL ASSETS: Finished');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  async generateAthleteNflAssetsAnimation() {
    this.logger.debug('Generate Athlete NFL Assets Animation: STARTED');
    const athletes = await Athlete.find({
      where: {
        apiId: In(NFL_ATHLETE_IDS),
        team: { sport: SportType.NFL },
      },
      relations: {
        team: true,
      },
    });
    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(
        `./src/utils/nfl-svg-teams-animation-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgAnimationTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[2].tspan['_attributes']['font-size'] = '50';
          result.svg.g[5].text[3].tspan['_attributes']['font-size'] = '50';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[4].tspan['_attributes']['font-size'] = '50';
          result.svg.g[5].text[5].tspan['_attributes']['font-size'] = '50';
        }

        result.svg.g[5].text[0].tspan['_cdata'] = '';
        result.svg.g[5].text[1].tspan['_cdata'] = '';
        result.svg.g[5].text[2].tspan['_cdata'] =
          athlete.firstName.toUpperCase();
        result.svg.g[5].text[3].tspan['_cdata'] =
          athlete.firstName.toUpperCase();
        result.svg.g[5].text[4].tspan['_cdata'] =
          athlete.lastName.toUpperCase();
        result.svg.g[5].text[5].tspan['_cdata'] =
          athlete.lastName.toUpperCase();
        result.svg.g[5].g[0].text[0].tspan['_cdata'] =
          athlete.position.toUpperCase();
        result.svg.g[5].g[0].text[1].tspan['_cdata'] =
          athlete.position.toUpperCase();
        result = convert.js2xml(result, options);
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
        console.log(e);
      }

      // fs.writeFileSync(
      //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )
      var buffer = Buffer.from(result, 'utf8');
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });
      const filename = `${
        athlete.apiId
      }-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`;
      const s3_location = 'media/athlete/nfl/animations/';
      const fileContent = buffer;
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: 'image/svg+xml',
        CacheControl: 'no-cache',
      };

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err);
        } else {
          athlete.nftAnimation = data['Location'];
          await Athlete.save(athlete);
        }
      });
    }
  }

  async generateAthleteNflAssetsPromo() {
    this.logger.debug('Generate Athlete NFL Assets Promo: STARTED');

    const athletes = await Athlete.find({
      where: { apiId: In(NFL_ATHLETE_IDS), team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nfl-svg-teams-promo-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]['_attributes']['style'] =
            'fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]['_attributes']['style'] =
            'fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;';
        }

        result.svg.g[5]['text'][1]['tspan']['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[5]['text'][2]['tspan']['_text'] =
          athlete.lastName.toUpperCase();
        result.svg.g[5]['text'][0]['tspan']['_text'] =
          athlete.position.toUpperCase();
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nfl-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, 'utf8');
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });
      const filename = `${
        athlete.apiId
      }-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`;
      const s3_location = 'media/athlete/nfl/promo_images/';
      const fileContent = buffer;
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: 'image/svg+xml',
        CacheControl: 'no-cache',
      };

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err);
        } else {
          athlete.nftImagePromo = data['Location'];
          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete NFL Assets Promo: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  //@Timeout(450000)
  async generateAthleteNflAssetsLocked() {
    this.logger.debug('Generate Athlete NFL Assets Locked: STARTED');

    const athletes = await Athlete.find({
      where: { apiId: In(NFL_ATHLETE_IDS), team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nfl-svg-teams-lock-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]['_attributes']['style'] =
            'fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]['_attributes']['style'] =
            'fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;';
        }

        result.svg.g[5]['text'][1]['tspan']['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[5]['text'][2]['tspan']['_text'] =
          athlete.lastName.toUpperCase();
        result.svg.g[5]['text'][0]['tspan']['_text'] =
          athlete.position.toUpperCase();
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nfl-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, 'utf8');
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });
      const filename = `${
        athlete.apiId
      }-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`;
      const s3_location = 'media/athlete/nfl/locked_images/';
      const fileContent = buffer;
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: 'image/svg+xml',
        CacheControl: 'no-cache',
      };

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err);
        } else {
          athlete.nftImageLocked = data['Location'];
          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete NFL Assets Locked: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  //@Timeout(1)
  @Interval(86400000) //runs every 1 day
  async updateNflAthleteHeadshots() {
    this.logger.debug('Update Athlete NFL Headshots: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/headshots/json/Headshots?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (status === 200) {
      const updateAthlete: Athlete[] = [];
      for (let athlete of data) {
        const apiId: number = athlete['PlayerID'];
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        });

        if (curAthlete) {
          curAthlete.playerHeadshot = athlete['PreferredHostedHeadshotUrl'];
          updateAthlete.push(curAthlete);
        }
      }
      await Athlete.save(updateAthlete, { chunk: 20 });
      this.logger.debug('Update Athlete NFL Headshots: FINISHED');
    } else {
      this.logger.error('NFL Athlete Headshot Data: SPORTS DATA ERROR');
    }
  }

  @Interval(900000) // Runs every 15 mins
  async updateNflAthleteStatsPerSeason() {
    this.logger.debug('Update NFL Athlete Stats: STARTED');

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0];

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason;

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        );

        if (status === 200) {
          const newStats: AthleteStat[] = [];
          const updateStats: AthleteStat[] = [];

          for (let athleteStat of data) {
            const apiId: number = athleteStat['PlayerID'];
            const numberOfGames: number =
              athleteStat['Played'] > 0 ? athleteStat['Played'] : 1;
            const curStat = await AthleteStat.findOne({
              where: {
                athlete: { apiId },
                season: season.toString(),
                type: AthleteStatType.SEASON,
              },
              relations: {
                athlete: true,
              },
            });

            if (curStat) {
              // Update stats here
              curStat.fantasyScore =
                athleteStat['FantasyPointsDraftKings'] / numberOfGames;
              curStat.completion =
                athleteStat['PassingCompletionPercentage'] / numberOfGames;
              curStat.carries = athleteStat['RushingAttempts'] / numberOfGames;
              curStat.passingYards =
                athleteStat['PassingYards'] / numberOfGames;
              curStat.rushingYards =
                athleteStat['RushingYards'] / numberOfGames;
              curStat.receivingYards =
                athleteStat['ReceivingYards'] / numberOfGames;
              curStat.interceptions =
                athleteStat['PassingInterceptions'] / numberOfGames;
              curStat.passingTouchdowns =
                athleteStat['PassingTouchdowns'] / numberOfGames;
              curStat.rushingTouchdowns =
                athleteStat['RushingTouchdowns'] / numberOfGames;
              curStat.receivingTouchdowns =
                athleteStat['ReceivingTouchdowns'] / numberOfGames;
              curStat.targets = athleteStat['ReceivingTargets'] / numberOfGames;
              curStat.receptions = athleteStat['Receptions'] / numberOfGames;
              curStat.played = athleteStat['Played'];
              updateStats.push(curStat);
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              });

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season.toString(),
                    type: AthleteStatType.SEASON,
                    position: athleteStat['Position'],
                    played: athleteStat['Played'],
                    fantasyScore:
                      athleteStat['FantasyPointsDraftKings'] / numberOfGames,
                    completion:
                      athleteStat['PassingCompletionPercentage'] /
                      numberOfGames,
                    carries: athleteStat['RushingAttempts'] / numberOfGames,
                    passingYards: athleteStat['PassingYards'] / numberOfGames,
                    rushingYards: athleteStat['RushingYards'] / numberOfGames,
                    receivingYards:
                      athleteStat['ReceivingYards'] / numberOfGames,
                    passingTouchdowns:
                      athleteStat['PassingTouchdowns'] / numberOfGames,
                    interceptions:
                      athleteStat['PassingInterceptions'] / numberOfGames,
                    rushingTouchdowns:
                      athleteStat['RushingTouchdowns'] / numberOfGames,
                    receivingTouchdowns:
                      athleteStat['ReceivingTouchdowns'] / numberOfGames,
                    targets: athleteStat['ReceivingTargets'] / numberOfGames,
                    receptions: athleteStat['Receptions'] / numberOfGames,
                  })
                );
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

          this.logger.debug('Update NFL Athlete Stats: FINISHED');
        } else {
          this.logger.error('NFL Athlete Stats Data: SPORTS DATA ERROR');
        }
      }
    } else {
      this.logger.error('NFL Timeframes Data: SPORTS DATA ERROR');
    }
  }
  @Interval(300000) // Runs every 5 mins
  async updateNflAthleteStatsPerWeek() {
    this.logger.debug('Update NFL Athlete Stats Per Week: STARTED');

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0];

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason;
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : '1';

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        );

        if (status === 200) {
          const newStats: AthleteStat[] = [];
          const updateStats: AthleteStat[] = [];

          for (let athleteStat of data) {
            const apiId: number = athleteStat['PlayerID'];
            const curStat = await AthleteStat.findOne({
              where: {
                athlete: { apiId },
                season: season,
                week: week,
                type: AthleteStatType.WEEKLY,
              },
              relations: {
                athlete: true,
              },
            });

            const apiDate = moment.tz(
              athleteStat['GameDate'],
              'America/New_York'
            );

            const utcDate = apiDate.utc().format();

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat['FantasyPointsDraftKings'];
              curStat.completion = athleteStat['PassingCompletionPercentage'];
              curStat.carries = athleteStat['RushingAttempts'];
              curStat.passingYards = athleteStat['PassingYards'];
              curStat.rushingYards = athleteStat['RushingYards'];
              curStat.receivingYards = athleteStat['ReceivingYards'];
              curStat.interceptions = athleteStat['PassingInterceptions'];
              curStat.passingTouchdowns = athleteStat['PassingTouchdowns'];
              curStat.rushingTouchdowns = athleteStat['RushingTouchdowns'];
              curStat.receivingTouchdowns = athleteStat['ReceivingTouchdowns'];
              curStat.targets = athleteStat['ReceivingTargets'];
              curStat.receptions = athleteStat['Receptions'];
              curStat.played = athleteStat['Played'];
              curStat.gameDate =
                athleteStat['GameDate'] !== null
                  ? new Date(utcDate)
                  : athleteStat['GameDate'];
              updateStats.push(curStat);
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              });

              const opponent = await Team.findOne({
                where: { key: athleteStat['Opponent'] },
              });

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season,
                    week: week,
                    opponent: opponent,
                    gameDate:
                      athleteStat['GameDate'] !== null
                        ? new Date(utcDate)
                        : athleteStat['GameDate'],
                    type: AthleteStatType.WEEKLY,
                    played: athleteStat['Played'],
                    position: athleteStat['Position'],
                    fantasyScore: athleteStat['FantasyPointsDraftKings'],
                    completion: athleteStat['PassingCompletionPercentage'],
                    carries: athleteStat['RushingAttempts'],
                    passingYards: athleteStat['PassingYards'],
                    rushingYards: athleteStat['RushingYards'],
                    receivingYards: athleteStat['ReceivingYards'],
                    passingTouchdowns: athleteStat['PassingTouchdowns'],
                    interceptions: athleteStat['PassingInterceptions'],
                    rushingTouchdowns: athleteStat['RushingTouchdowns'],
                    receivingTouchdowns: athleteStat['ReceivingTouchdowns'],
                    targets: athleteStat['ReceivingTargets'],
                    receptions: athleteStat['Receptions'],
                  })
                );
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

          this.logger.debug('Update NFL Athlete Stats Per Week: FINISHED');
        } else {
          this.logger.error('NFL Athlete Stats Data: SPORTS DATA ERROR');
        }
      }
    } else {
      this.logger.error('NFL Timeframes Data: SPORTS DATA ERROR');
    }
  }
  @Interval(3600000) //runs every 1 hour
  async updateNflAthleteInjuryStatus() {
    this.logger.debug('Update NFL Athlete Injury Status: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (status === 200) {
      const updateAthlete: Athlete[] = [];
      for (let athlete of data) {
        const apiId: number = athlete['PlayerID'];
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        });

        if (curAthlete) {
          curAthlete.isInjured = athlete['InjuryStatus'];
          updateAthlete.push(curAthlete);
        }

        await Athlete.save(updateAthlete, { chunk: 20 });
      }
      this.logger.debug('Update NFL Injury Status: FINISHED');
    } else {
      this.logger.error('NFL Athlete Injury Data: SPORTS DATA ERROR');
    }
  }

  //@Timeout(1)
  async updateNflAthleteStatsAllWeeks() {
    this.logger.debug('Update NFL Athlete Stats All Weeks: STARTED');

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0];

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        // const season = timeFrame.ApiSeason
        // const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : "1"
        const season = '2022PLAY';
        const week = '18';

        for (let curWeek = 1; curWeek <= Number(week); curWeek++) {
          const { data, status } = await axios.get(
            `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${curWeek}?key=${process.env.SPORTS_DATA_NFL_KEY}`
          );

          if (status === 200) {
            const newStats: AthleteStat[] = [];
            const updateStats: AthleteStat[] = [];

            for (let athleteStat of data) {
              const apiId: number = athleteStat['PlayerID'];
              const curStat = await AthleteStat.findOne({
                where: {
                  athlete: { apiId },
                  season: season,
                  week: curWeek.toString(),
                  type: AthleteStatType.WEEKLY,
                },
                relations: {
                  athlete: true,
                },
              });

              const opponent = await Team.findOne({
                where: { apiId: athleteStat['GlobalOpponentID'] },
              });

              if (curStat) {
                // Update stats here
                curStat.fantasyScore = athleteStat['FantasyPointsDraftKings'];
                curStat.completion = athleteStat['PassingCompletionPercentage'];
                curStat.carries = athleteStat['RushingAttempts'];
                curStat.passingYards = athleteStat['PassingYards'];
                curStat.rushingYards = athleteStat['RushingYards'];
                curStat.receivingYards = athleteStat['ReceivingYards'];
                curStat.interceptions = athleteStat['PassingInterceptions'];
                curStat.passingTouchdowns = athleteStat['PassingTouchdowns'];
                curStat.rushingTouchdowns = athleteStat['RushingTouchdowns'];
                curStat.receivingTouchdowns =
                  athleteStat['ReceivingTouchdowns'];
                curStat.targets = athleteStat['ReceivingTargets'];
                curStat.receptions = athleteStat['Receptions'];
                curStat.played = athleteStat['Played'];
                curStat.opponent = opponent;
                updateStats.push(curStat);
              } else {
                const curAthlete = await Athlete.findOne({
                  where: { apiId },
                });

                if (curAthlete) {
                  newStats.push(
                    AthleteStat.create({
                      athlete: curAthlete,
                      season: season,
                      week: curWeek.toString(),
                      opponent: opponent,
                      gameDate: new Date(athleteStat['GameDate']),
                      type: AthleteStatType.WEEKLY,
                      played: athleteStat['Played'],
                      position: athleteStat['Position'],
                      fantasyScore: athleteStat['FantasyPointsDraftKings'],
                      completion: athleteStat['PassingCompletionPercentage'],
                      carries: athleteStat['RushingAttempts'],
                      passingYards: athleteStat['PassingYards'],
                      rushingYards: athleteStat['RushingYards'],
                      receivingYards: athleteStat['ReceivingYards'],
                      passingTouchdowns: athleteStat['PassingTouchdowns'],
                      interceptions: athleteStat['PassingInterceptions'],
                      rushingTouchdowns: athleteStat['RushingTouchdowns'],
                      receivingTouchdowns: athleteStat['ReceivingTouchdowns'],
                      targets: athleteStat['ReceivingTargets'],
                      receptions: athleteStat['Receptions'],
                    })
                  );
                }
              }
            }

            await AthleteStat.save([...newStats, ...updateStats], {
              chunk: 20,
            });

            this.logger.debug(
              `Update NFL Athlete Stats Week ${curWeek}: FINISHED`
            );
          } else {
            this.logger.error('NFL Athlete Stats Data: SPORTS DATA ERROR');
          }
        }
      }
    } else {
      this.logger.error('NFL Timeframes Data: SPORTS DATA ERROR');
    }

    this.logger.debug('Update NFL Athlete Stats All Weeks: FINISHED');
  }

  // @Cron("55 11 * * *", {
  //   name: "updateNflTeamScores",
  //   timeZone: "Asia/Manila",
  // })
  async updateNflTeamScores() {
    this.logger.debug('Update NFL Team Scores: STARTED');

    const timeFrames = await axios.get(
      `https://api.sportsdata.io/v3/nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0];

      if (timeFrame) {
        const season = timeFrame.ApiSeason;
        // const season = "2021REG"
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : 1;

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        );

        if (status === 200) {
          const now = new Date();
          const gameTeams = [];

          // Get active games
          const games = await Game.find({
            where: {
              startTime: LessThanOrEqual(now),
              endTime: MoreThanOrEqual(now),
            },
            relations: {
              teams: {
                athletes: {
                  athlete: true,
                },
              },
            },
          });

          for (let game of games) {
            for (let gameTeam of game.teams) {
              var totalFantasyScore = 0;

              for (let athlete of gameTeam.athletes) {
                const athleteData = data.find(
                  (athleteData: any) =>
                    athleteData.PlayerID === athlete.athlete.apiId
                );

                if (athleteData !== undefined) {
                  totalFantasyScore += athleteData.FantasyPointsDraftKings;
                }
              }

              gameTeam.fantasyScore = totalFantasyScore;
              gameTeams.push(gameTeam);
            }
          }

          await GameTeam.save(gameTeams, { chunk: 20 });

          this.logger.debug('Update NFL Team Scores: FINISHED');
        }
      }
    }
  }

  //@Timeout(1)
  async getInitialNflTimeframe() {
    this.logger.debug('Get Initial NFL Timeframe: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (status === 200) {
      const newTimeframe: Timeframe[] = [];
      const updateTimeframe: Timeframe[] = [];

      for (let timeframe of data) {
        const apiSeason: string = timeframe['ApiSeason'];
        const apiWeek: string = timeframe['ApiWeek'];
        const apiName: string = timeframe['Name'];
        const currTimeframe = await Timeframe.findOne({
          where: {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          },
        });

        if (currTimeframe) {
          currTimeframe.apiName = timeframe['Name'];
          currTimeframe.season = timeframe['Season'];
          currTimeframe.seasonType = timeframe['SeasonType'];
          currTimeframe.apiWeek = timeframe['ApiWeek'];
          currTimeframe.apiSeason = timeframe['ApiSeason'];
          currTimeframe.startDate = timeframe['StartDate'];
          currTimeframe.endDate = timeframe['EndDate'];
          updateTimeframe.push(currTimeframe);
        } else {
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe['Name'],
              season: timeframe['Season'],
              seasonType: timeframe['SeasonType'],
              apiWeek: timeframe['ApiWeek'],
              apiSeason: timeframe['ApiSeason'],
              sport: SportType.NFL,
              startDate: timeframe['StartDate'],
              endDate: timeframe['EndDate'],
            })
          );
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], {
        chunk: 20,
      });
      this.logger.debug('Get Initial NFL Timeframe: FINISHED');
    } else {
      this.logger.error('Get Initial NFL Timeframe: SPORTS DATA ERROR');
    }
  }

  @Interval(259200000) //Runs every 3 days
  async updateNflTimeframe() {
    this.logger.debug('Update NFL Timeframe: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (status === 200) {
      const newTimeframe: Timeframe[] = [];
      const updateTimeframe: Timeframe[] = [];

      for (let timeframe of data) {
        const apiSeason: string = timeframe['ApiSeason'];
        const apiWeek: string = timeframe['ApiWeek'];
        const apiName: string = timeframe['Name'];
        const currTimeframe = await Timeframe.findOne({
          where: {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          },
        });

        const startApiDate = moment
          .tz(timeframe['StartDate'], 'America/New_York')
          .utc()
          .format();
        const endApiDate = moment
          .tz(timeframe['EndDate'], 'America/New_York')
          .utc()
          .format();
        if (currTimeframe) {
          currTimeframe.apiName = timeframe['Name'];
          currTimeframe.season = timeframe['Season'];
          currTimeframe.seasonType = timeframe['SeasonType'];
          currTimeframe.apiWeek = timeframe['ApiWeek'];
          currTimeframe.apiSeason = timeframe['ApiSeason'];
          currTimeframe.startDate =
            timeframe['StartDate'] !== null
              ? startApiDate
              : timeframe['StartDate'];
          currTimeframe.endDate =
            timeframe['EndDate'] !== null ? endApiDate : timeframe['EndDate'];
          updateTimeframe.push(currTimeframe);
        } else {
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe['Name'],
              season: timeframe['Season'],
              seasonType: timeframe['SeasonType'],
              apiWeek: timeframe['ApiWeek'],
              apiSeason: timeframe['ApiSeason'],
              sport: SportType.NFL,
              startDate:
                timeframe['StartDate'] !== null
                  ? startApiDate
                  : timeframe['StartDate'],
              endDate:
                timeframe['EndDate'] !== null
                  ? endApiDate
                  : timeframe['EndDate'],
            })
          );
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], {
        chunk: 20,
      });
      this.logger.debug('Update NFL Timeframe: FINISHED');
    } else {
      this.logger.error('Update NFL Timeframe: SPORTS DATA ERROR');
    }
  }

  @Interval(4200000)
  async updateNflSchedules() {
    this.logger.debug('UPDATE NFL Schedules: STARTED');

    const currSeason = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NFL_KEY}`
    );

    if (currSeason.status === 200) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/scores/json/Schedules/${currSeason.data}?key=${process.env.SPORTS_DATA_NFL_KEY}`
      );
      if (status === 200) {
        const newSchedule: Schedule[] = [];
        const updateSchedule: Schedule[] = [];

        for (let schedule of data) {
          const gameId: number = schedule['GlobalGameID'];

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId, sport: SportType.NFL },
          });

          const timeFromAPI = moment.tz(
            schedule['DateTime'],
            'America/New_York'
          );
          const utcDate = timeFromAPI.utc().format();

          if (currSchedule) {
            currSchedule.season = schedule['Season'];
            currSchedule.seasonType = schedule['SeasonType'];
            currSchedule.status = schedule['Status'];
            currSchedule.awayTeam = schedule['AwayTeam'];
            currSchedule.homeTeam = schedule['HomeTeam'];
            currSchedule.isClosed =
              schedule['IsClosed'] !== null ? schedule['IsClosed'] : false;
            currSchedule.dateTime =
              schedule['DateTime'] !== null
                ? new Date(utcDate)
                : schedule['DateTime'];
            currSchedule.dateTimeUTC =
              schedule['DateTime'] !== null
                ? new Date(utcDate)
                : schedule['DateTime'];
            updateSchedule.push(currSchedule);
          } else {
            newSchedule.push(
              Schedule.create({
                gameId: schedule['GlobalGameID'],
                season: schedule['Season'],
                seasonType: schedule['SeasonType'],
                status: schedule['Status'],
                awayTeam: schedule['AwayTeam'],
                homeTeam: schedule['HomeTeam'],
                isClosed:
                  schedule['IsClosed'] !== null ? schedule['IsClosed'] : false,
                dateTime:
                  schedule['DateTime'] !== null
                    ? new Date(utcDate)
                    : schedule['DateTime'],
                dateTimeUTC:
                  schedule['DateTime'] !== null
                    ? new Date(utcDate)
                    : schedule['DateTime'],
                sport: SportType.NFL,
              })
            );
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], { chunk: 20 });
        this.logger.debug('Update NFL Schedules: FINISHED');
      } else {
        this.logger.debug('Update NFL Schedules: SPORTS DATA ERROR');
      }
    } else {
      this.logger.debug(
        'Update NFL Schedules: Could not get current season from sportsdata'
      );
    }
  }
}
