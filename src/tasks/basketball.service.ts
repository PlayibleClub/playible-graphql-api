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
export class BasketballService {
  private readonly logger = new Logger(BasketballService.name);
  @Timeout(1)
  async runService() {
    this.logger.debug('Starting basketball service');
  }
  //@Timeout(1)
  async runPolygonMainnetNBAGameWebSocketListener() {
    function listenToNBAGameContract() {
      const logger = new Logger('NFLGameContract');
      console.log('Start polygon listen');
      const network = 'matic'; //change to mainnet after
      const address = process.env.METAMASK_WALLET_ADDRESS ?? 'default';
      const abi = gameABI;
      const provider = new ethers.AlchemyProvider(
        network,
        process.env.ALCHEMY_POLYGON_API_KEY
      );

      provider.pollingInterval = 20000;
      const gameContract = new Contract(
        process.env.POLYGON_NBA_GAME_ADDRESS ?? 'contract', //change to NFL specific
        abi,
        provider
      );
      try {
        gameContract.on(
          'AddGame',
          async (gameId, gameTimeStart, gameTimeEnd, event) => {
            logger.debug('Found Playible Polygon NFL game');
            const convertGameId =
              typeof gameId === 'bigint' ? Number(gameId) : gameId;
            const game = await Game.findOne({
              where: {
                gameId: convertGameId,
                chain: ChainType.POLYGON,
                sport: SportType.NBA,
              },
            });
            if (!game) {
              //game doesn't exist
              await Game.create({
                gameId: convertGameId,
                name: `Game ${convertGameId}`,
                description: 'Playible POLYGON Game',
                startTime: moment
                  .unix(
                    typeof gameTimeStart === 'bigint'
                      ? Number(gameTimeStart)
                      : gameTimeStart
                  )
                  .utc(),
                endTime: moment
                  .unix(
                    typeof gameTimeEnd === 'bigint'
                      ? Number(gameTimeEnd)
                      : gameTimeEnd
                  )
                  .utc(),
                sport: SportType.NBA,
                chain: ChainType.POLYGON,
              }).save();

              logger.debug(
                `Game ${convertGameId} created for ${SportType.NBA} at ${ChainType.POLYGON}`
              );
            } else {
              logger.error(
                `Game ${convertGameId} for ${SportType.NBA} at ${ChainType.POLYGON} already exists`
              );
            }

            console.log(event.log);
          }
        );

        gameContract.on(
          'SucceedLineupSubmission',
          async (result, gameId, teamName, address, lineup, tokens, event) => {
            logger.debug('Found Playible Polygon NBA Submit Lineup');
            logger.debug(result);
            const convertGameId =
              typeof gameId === 'bigint' ? Number(gameId) : gameId;
            const eventLogs = event;
            const game = await Game.findOne({
              where: {
                gameId: convertGameId,
                sport: SportType.NBA,
                chain: ChainType.POLYGON,
              },
            });
            if (game) {
              // game exists
              const gameTeam = await GameTeam.findOne({
                where: {
                  game: {
                    id: game.id,
                  },
                  name: teamName,
                  wallet_address: address,
                },
                relations: {
                  game: true,
                },
              });

              if (!gameTeam) {
                const currGameTeam = await GameTeam.create({
                  game: game,
                  name: teamName,
                  wallet_address: address,
                }).save();
                for (let i = 0; i < lineup.length; i++) {
                  const athlete = await Athlete.findOne({
                    where: {
                      apiId: Number(lineup[i]),
                    },
                  });
                  let tokenId = Number(tokens[i]).toString();
                  let tokenType: TokenType = TokenType.REG;
                  switch (tokenId[0]) {
                    case '1':
                      tokenType = TokenType.REG;
                      break;
                    case '2':
                      tokenType = TokenType.PROMO;
                      break;
                    case '3':
                      tokenType = TokenType.SOULBOUND;
                      break;
                  }
                  if (athlete) {
                    try {
                      await GameTeamAthlete.create({
                        gameTeam: currGameTeam,
                        athlete: athlete,
                        token_id: tokenId,
                        type: tokenType,
                      }).save();
                    } catch (e) {
                      logger.debug(e);
                    }
                  } else {
                    logger.debug('ERROR athlete apiId not found');
                  }
                }
                logger.debug(
                  `Successfully added team ${teamName} for ${address} on game ${gameId} at chain ${ChainType.POLYGON}`
                );
                // for (let apiId of lineup) {
                //   const athlete = await Athlete.findOne({
                //     where: {
                //       apiId: Number(apiId),
                //     },
                //   });
                //   if (athlete) {
                //     try {
                //       await GameTeamAthlete.create({
                //         gameTeam: currGameTeam,
                //         athlete: athlete,

                //       }).save();
                //     } catch (e) {
                //       logger.debug(e);
                //     }
                //   } else {
                //     logger.debug('ERROR athlete apiId not found');
                //   }
                // }
                // logger.debug('Successfully added team');
              } else {
                logger.debug(
                  `Team already exists on Game ${convertGameId} for ${SportType.NBA} at ${ChainType.POLYGON}`
                );
              }
            } else {
              logger.error(
                `Game ${convertGameId} does not exist for ${SportType.NFL} at ${ChainType.POLYGON}`
              );
            }
          }
        );
      } catch (error) {
        const code = (error as any).error.code;
        const message = (error as any).error.message;
        if (
          (code === '-32000' || code === -32000) &&
          message === 'filter not found'
        ) {
          logger.error(
            'Encountered an error in alchemy listeners, rerunning function to reconnect'
          );
          gameContract.removeAllListeners();
          setTimeout(() => listenToNBAGameContract(), 1000);
        }
      }

      // const filter = {
      //   topics: [
      //     "0xf67cbd2d2262c1c99a110c17514f7e1c866ec08c3becf5ab2f4986c1ea01a56b",
      //   ],
      // };
      // provider.on(filter, (log, event) => {
      //   console.log(log);
      //   console.log(event);
      // });
    }
    listenToNBAGameContract();
  }
  //@Timeout(1)
  async syncNbaData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.NBA },
    });

    if (teamsCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nba/scores/json/AllTeams?key=${process.env.SPORTS_DATA_NBA_KEY}`
      );

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team['GlobalTeamID'],
              name: team['Name'],
              key: team['Key'],
              location: team['City'],
              sport: SportType.NBA,
              primaryColor: `#${team['PrimaryColor']}`,
              secondaryColor: `#${team['SecondaryColor']}`,
            }).save();
          } catch (e) {
            this.logger.error(e);
          }
        }
      } else {
        this.logger.error('NBA Teams Data: SPORTS DATA ERROR');
      }
    }

    this.logger.debug(
      `NBA Teams Data: ${teamsCount ? 'DID NOT SYNC' : 'SYNCED SUCCESSFULLY'}`
    );

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.NBA } },
    });

    if (athletesCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`
      );

      if (status === 200) {
        for (let athlete of data) {
          if (NBA_ATHLETE_IDS.includes(athlete['PlayerID'])) {
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
                  jersey: athlete['Jersey'],
                  team,
                  isActive: athlete['Status'] === 'Active',
                  isInjured: athlete['InjuryStatus'],
                }).save();
              }
            } catch (e) {
              this.logger.error(e);
            }
          }
        }
      }
    } else {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`
      );
      if (status === 200) {
        const newAthlete: Athlete[] = [];
        const updateAthlete: Athlete[] = [];
        let counter = 0;
        for (let athlete of data) {
          if (NBA_ATHLETE_IDS.includes(athlete['PlayerID'])) {
            try {
              const team = await Team.findOne({
                where: { apiId: athlete['GlobalTeamID'] },
              });
              if (team) {
                const currAthlete = await Athlete.findOne({
                  where: { apiId: athlete['PlayerID'] },
                });

                if (currAthlete) {
                  currAthlete.firstName = athlete['FirstName'];
                  currAthlete.lastName = athlete['LastName'];
                  currAthlete.position =
                    athlete['Position'] !== null ? athlete['Position'] : 'N/A';
                  currAthlete.jersey = athlete['Jersey'];
                  currAthlete.isActive = athlete['Status'] === 'Active';
                  currAthlete.isInjured = athlete['InjuryStatus'];
                  currAthlete.team = team;
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
                      jersey: athlete['Jersey'],
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
            counter++;
          }
        }
        await Athlete.save([...newAthlete, ...updateAthlete], { chunk: 20 });
        this.logger.debug(`Athlete count: ${counter}`);
        this.logger.debug('NBA Athletes: UPDATED');
      } else {
        this.logger.error('NBA Athletes: SPORTS DATA ERROR');
      }
    }

    this.logger.debug(
      `NBA Athletes Data: ${
        athletesCount ? 'DID NOT SYNC' : 'SYNCED SUCCESSFULLY'
      }`
    );
  }

  //@Timeout(300000)
  async generateAthleteNbaAssets() {
    this.logger.debug('Generate Athlete NBA Assets: STARTED');

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nba-svg-teams-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }

        result.svg.g[6]['text'][1]['tspan']['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[6]['text'][2]['tspan']['_text'] =
          athlete.lastName.toUpperCase();
        result.svg.g[6]['text'][0]['tspan']['_text'] =
          athlete.position.toUpperCase();
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nba-images/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
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
      const s3_location = 'media/athlete/nba/images/';
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

    this.logger.debug('Generate Athlete NBA Assets: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  //@Timeout(450000)
  async generateAthleteNbaAssetsAnimation() {
    this.logger.debug('Generate Athlete NBA Assets Animation: STARTED');

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(
        `./src/utils/nba-svg-teams-animation-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgAnimationTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[4].text[2].tspan['_attributes']['font-size'] = '50';
          result.svg.g[4].text[3].tspan['_attributes']['font-size'] = '50';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[4].text[4].tspan['_attributes']['font-size'] = '50';
          result.svg.g[4].text[5].tspan['_attributes']['font-size'] = '50';
        }

        result.svg.g[4].text[0].tspan['_text'] = athlete.position.toUpperCase();
        result.svg.g[4].text[1].tspan['_text'] = athlete.position.toUpperCase();
        result.svg.g[4].text[2].tspan['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[4].text[3].tspan['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[4].text[4].tspan['_text'] = athlete.lastName.toUpperCase();
        result.svg.g[4].text[5].tspan['_text'] = athlete.lastName.toUpperCase();
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
      const s3_location = 'media/athlete/nba/animations/';
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

    this.logger.debug('Generate Athlete NBA Assets Animations: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  //@Timeout(600000)
  async generateAthleteNbaAssetsPromo() {
    this.logger.debug('Generate Athlete NBA Assets Promo: STARTED');

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nba-svg-teams-promo-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }

        result.svg.g[6]['text'][1]['tspan']['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[6]['text'][2]['tspan']['_text'] =
          athlete.lastName.toUpperCase();
        result.svg.g[6]['text'][0]['tspan']['_text'] =
          athlete.position.toUpperCase();
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nba-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
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
      const s3_location = 'media/athlete/nba/promo_images/';
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

    this.logger.debug('Generate Athlete NBA Assets Promo: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }
  //@Timeout(1)
  @Interval(86400000) //runs every 1 day
  async updateNbaAthleteHeadshots() {
    this.logger.debug('Update Athlete NBA Headshots: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/headshots/json/Headshots?key=${process.env.SPORTS_DATA_NBA_KEY}`
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
      this.logger.debug('Update Athlete NBA Headshots: FINISHED');
    } else {
      this.logger.error('NBA Athlete Headshot Data: SPORTS DATA ERROR');
    }
  }
  //@Timeout(750000)
  async generateAthleteNbaAssetsLocked() {
    this.logger.debug('Generate Athlete NBA Assets Locked: STARTED');

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/nba-svg-teams-lock-templates/${athlete.team.key}.svg`,
        'utf-8'
      );
      var options = { compact: true, ignoreComment: true, spaces: 4 };
      var result: any = convert.xml2js(svgTemplate, options);

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]['_attributes']['style'] =
            'font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700';
        }

        result.svg.g[6]['text'][1]['tspan']['_text'] =
          athlete.firstName.toUpperCase();
        result.svg.g[6]['text'][2]['tspan']['_text'] =
          athlete.lastName.toUpperCase();
        result.svg.g[6]['text'][0]['tspan']['_text'] =
          athlete.position.toUpperCase();
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
      }

      result = convert.js2xml(result, options);
      // fs.writeFileSync(
      //   `./nba-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
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
      const s3_location = 'media/athlete/nba/locked_images/';
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

    this.logger.debug('Generate Athlete NBA Assets Locked: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  @Interval(3600000) //runs every 1 hour
  async updateNbaAthleteInjuryStatus() {
    this.logger.debug('Update NBA Athlete Injury Status: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`
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
      }
      await Athlete.save(updateAthlete, { chunk: 20 });
      this.logger.debug('Update NBA Injury Status: FINISHED');
    } else {
      this.logger.error('NBA Athlete Injury Data: SPORTS DATA ERROR');
    }
  }
  //@Timeout(1)
  @Interval(900000) // Runs every 15 mins
  async updateNbaAthleteStatsPerSeason() {
    this.logger.debug('Update NBA Athlete Stats: STARTED');
    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data;

      if (timeFrame) {
        const season = timeFrame.ApiSeason;

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        );

        if (status === 200) {
          const newStats: AthleteStat[] = [];
          const updateStats: AthleteStat[] = [];

          for (let athleteStat of data) {
            const apiId: number = athleteStat['PlayerID'];
            const numberOfGames: number =
              athleteStat['Games'] > 0 ? athleteStat['Games'] : 1;
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
              curStat.points = athleteStat['Points'] / numberOfGames;
              curStat.rebounds = athleteStat['Rebounds'] / numberOfGames;
              curStat.offensiveRebounds =
                athleteStat['OffensiveRebounds'] / numberOfGames;
              curStat.defensiveRebounds =
                athleteStat['DefensiveRebounds'] / numberOfGames;
              curStat.assists = athleteStat['Assists'] / numberOfGames;
              curStat.steals = athleteStat['Steals'] / numberOfGames;
              curStat.blockedShots =
                athleteStat['BlockedShots'] / numberOfGames;
              curStat.turnovers = athleteStat['Turnovers'] / numberOfGames;
              curStat.personalFouls =
                athleteStat['PersonalFouls'] / numberOfGames;
              curStat.fieldGoalsMade =
                athleteStat['FieldGoalsMade'] / numberOfGames;
              curStat.fieldGoalsAttempted =
                athleteStat['FieldGoalsAttempted'] / numberOfGames;
              curStat.fieldGoalsPercentage =
                athleteStat['FieldGoalsPercentage'] / numberOfGames;
              curStat.threePointersMade =
                athleteStat['ThreePointersMade'] / numberOfGames;
              curStat.threePointersAttempted =
                athleteStat['ThreePointersAttempted'] / numberOfGames;
              curStat.threePointersPercentage =
                athleteStat['ThreePointersPercentage'] / numberOfGames;
              curStat.freeThrowsMade =
                athleteStat['FreeThrowsMade'] / numberOfGames;
              curStat.freeThrowsAttempted =
                athleteStat['FreeThrowsAttempted'] / numberOfGames;
              curStat.freeThrowsPercentage =
                athleteStat['FreeThrowsPercentage'] / numberOfGames;
              curStat.minutes = athleteStat['Minutes'] / numberOfGames;
              curStat.played = athleteStat['Games'];
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
                    played: athleteStat['Games'],
                    fantasyScore:
                      athleteStat['FantasyPointsDraftKings'] / numberOfGames,
                    points: athleteStat['Points'] / numberOfGames,
                    rebounds: athleteStat['Rebounds'] / numberOfGames,
                    offensiveRebounds:
                      athleteStat['OffensiveRebounds'] / numberOfGames,
                    defensiveRebounds:
                      athleteStat['DefensiveRebounds'] / numberOfGames,
                    assists: athleteStat['Assists'] / numberOfGames,
                    steals: athleteStat['Steals'] / numberOfGames,
                    blockedShots: athleteStat['BlockedShots'] / numberOfGames,
                    turnovers: athleteStat['Turnovers'] / numberOfGames,
                    personalFouls: athleteStat['PersonalFouls'] / numberOfGames,
                    fieldGoalsMade:
                      athleteStat['FieldGoalsMade'] / numberOfGames,
                    fieldGoalsAttempted:
                      athleteStat['FieldGoalsAttempted'] / numberOfGames,
                    fieldGoalsPercentage:
                      athleteStat['FieldGoalsPercentage'] / numberOfGames,
                    threePointersMade:
                      athleteStat['ThreePointersMade'] / numberOfGames,
                    threePointersAttempted:
                      athleteStat['ThreePointersAttempted'] / numberOfGames,
                    threePointersPercentage:
                      athleteStat['ThreePointersPercentage'] / numberOfGames,
                    freeThrowsMade:
                      athleteStat['FreeThrowsMade'] / numberOfGames,
                    freeThrowsAttempted:
                      athleteStat['FreeThrowsAttempted'] / numberOfGames,
                    freeThrowsPercentage:
                      athleteStat['FreeThrowsPercentage'] / numberOfGames,
                    minutes: athleteStat['Minutes'] / numberOfGames,
                  })
                );
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

          this.logger.debug('Update NBA Athlete Stats: FINISHED');
        } else {
          this.logger.error('NBA Athlete Stats Data: SPORTS DATA ERROR');
        }
      }
    } else {
      this.logger.error('NBA Timeframes Data: SPORTS DATA ERROR');
    }
  }

  //@Timeout(1)
  @Interval(300000) // Runs every 5 mins
  async updateNbaAthleteStatsPerDay() {
    this.logger.debug('Update NBA Athlete Stats Per Day: STARTED');

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data;

      if (timeFrame) {
        const season = timeFrame.ApiSeason;
        const dateFormat = moment()
          .tz('America/New_York')
          .subtract(3, 'hours')
          .format('YYYY-MMM-DD')
          .toUpperCase();

        this.logger.debug(dateFormat);

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        );

        if (status === 200 && Object.keys(data).length !== 0) {
          const newStats: AthleteStat[] = [];
          const updateStats: AthleteStat[] = [];

          for (let athleteStat of data) {
            const apiId: number = athleteStat['PlayerID'];
            const curStat = await AthleteStat.findOne({
              where: {
                statId: athleteStat['StatID'],
              },
              relations: {
                athlete: true,
              },
            });

            const opponent = await Team.findOne({
              where: { apiId: athleteStat['GlobalOpponentID'] },
            });
            const apiDate = moment.tz(
              athleteStat['DateTime'],
              'America/New_York'
            );
            const utcDate = apiDate.utc().format();
            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat['FantasyPointsDraftKings'];
              curStat.opponent = opponent;
              curStat.season = season;
              curStat.points = athleteStat['Points'];
              curStat.rebounds = athleteStat['Rebounds'];
              curStat.offensiveRebounds = athleteStat['OffensiveRebounds'];
              curStat.defensiveRebounds = athleteStat['DefensiveRebounds'];
              curStat.assists = athleteStat['Assists'];
              curStat.steals = athleteStat['Steals'];
              curStat.blockedShots = athleteStat['BlockedShots'];
              curStat.turnovers = athleteStat['Turnovers'];
              curStat.personalFouls = athleteStat['PersonalFouls'];
              curStat.fieldGoalsMade = athleteStat['FieldGoalsMade'];
              curStat.fieldGoalsAttempted = athleteStat['FieldGoalsAttempted'];
              curStat.fieldGoalsPercentage =
                athleteStat['FieldGoalsPercentage'];
              curStat.threePointersMade = athleteStat['ThreePointersMade'];
              curStat.threePointersAttempted =
                athleteStat['ThreePointersAttempted'];
              curStat.threePointersPercentage =
                athleteStat['ThreePointersPercentage'];
              curStat.freeThrowsMade = athleteStat['FreeThrowsMade'];
              curStat.freeThrowsAttempted = athleteStat['FreeThrowsAttempted'];
              curStat.freeThrowsPercentage =
                athleteStat['FreeThrowsPercentage'];
              curStat.minutes = athleteStat['Minutes'];
              curStat.played = athleteStat['Games'];
              curStat.gameDate =
                athleteStat['DateTime'] !== null
                  ? new Date(utcDate)
                  : athleteStat['DateTime'];
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
                    opponent: opponent,
                    gameDate:
                      athleteStat['DateTime'] !== null
                        ? new Date(utcDate)
                        : athleteStat['DateTime'],
                    statId: athleteStat['StatID'],
                    type: AthleteStatType.DAILY,
                    position: athleteStat['Position'],
                    played: athleteStat['Games'],
                    fantasyScore: athleteStat['FantasyPointsDraftKings'],
                    points: athleteStat['Points'],
                    rebounds: athleteStat['Rebounds'],
                    offensiveRebounds: athleteStat['OffensiveRebounds'],
                    defensiveRebounds: athleteStat['DefensiveRebounds'],
                    assists: athleteStat['Assists'],
                    steals: athleteStat['Steals'],
                    blockedShots: athleteStat['BlockedShots'],
                    turnovers: athleteStat['Turnovers'],
                    personalFouls: athleteStat['PersonalFouls'],
                    fieldGoalsMade: athleteStat['FieldGoalsMade'],
                    fieldGoalsAttempted: athleteStat['FieldGoalsAttempted'],
                    fieldGoalsPercentage: athleteStat['FieldGoalsPercentage'],
                    threePointersMade: athleteStat['ThreePointersMade'],
                    threePointersAttempted:
                      athleteStat['ThreePointersAttempted'],
                    threePointersPercentage:
                      athleteStat['ThreePointersPercentage'],
                    freeThrowsMade: athleteStat['FreeThrowsMade'],
                    freeThrowsAttempted: athleteStat['FreeThrowsAttempted'],
                    freeThrowsPercentage: athleteStat['FreeThrowsPercentage'],
                    minutes: athleteStat['Minutes'],
                  })
                );
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });

          this.logger.debug('Update NBA Athlete Stats Per Day: FINISHED');
        } else {
          this.logger.debug(
            'Update NBA Athlete Stats Per Day: SPORTS DATA ERROR'
          );
          if (Object.keys(data).length === 0) {
            this.logger.debug(
              'Update NBA Athlete Stats Per Day: EMPTY DATA RESPONSE'
            );
          }
        }
      }
    } else {
      this.logger.error('NBA Timeframes Data: SPORTS DATA ERROR');
    }
  }

  //@Timeout(1)
  async updateNbaAthleteStatsPerDayLoop() {
    this.logger.debug('Update NBA Athlete GameDate Convert: STARTED');

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data;

      if (timeFrame) {
        let timesRun = 0;
        let interval = setInterval(async () => {
          timesRun += 1;
          const season = timeFrame.ApiSeason;
          const date = moment().subtract(timesRun, 'day').toDate();
          const dateFormat = moment(date).format('YYYY-MMM-DD').toUpperCase();
          this.logger.debug(dateFormat);

          const { data, status } = await axios.get(
            `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_NBA_KEY}`
          );

          if (status === 200) {
            const newStats: AthleteStat[] = [];
            const updateStats: AthleteStat[] = [];

            for (let athleteStat of data) {
              const apiId: number = athleteStat['PlayerID'];
              const curStat = await AthleteStat.findOne({
                where: { statId: athleteStat['StatID'] },
                relations: { athlete: true },
              });

              const opponent = await Team.findOne({
                where: { apiId: athleteStat['GlobalOpponentID'] },
              });
              const apiDate = moment.tz(
                athleteStat['DateTime'],
                'America/New_York'
              );
              const utcDate = apiDate.utc().format();
              if (curStat) {
                // Update stats here
                curStat.fantasyScore = athleteStat['FantasyPointsDraftKings'];
                curStat.opponent = opponent;
                curStat.season = season;
                curStat.points = athleteStat['Points'];
                curStat.rebounds = athleteStat['Rebounds'];
                curStat.offensiveRebounds = athleteStat['OffensiveRebounds'];
                curStat.defensiveRebounds = athleteStat['DefensiveRebounds'];
                curStat.assists = athleteStat['Assists'];
                curStat.steals = athleteStat['Steals'];
                curStat.blockedShots = athleteStat['BlockedShots'];
                curStat.turnovers = athleteStat['Turnovers'];
                curStat.personalFouls = athleteStat['PersonalFouls'];
                curStat.fieldGoalsMade = athleteStat['FieldGoalsMade'];
                curStat.fieldGoalsAttempted =
                  athleteStat['FieldGoalsAttempted'];
                curStat.fieldGoalsPercentage =
                  athleteStat['FieldGoalsPercentage'];
                curStat.threePointersMade = athleteStat['ThreePointersMade'];
                curStat.threePointersAttempted =
                  athleteStat['ThreePointersAttempted'];
                curStat.threePointersPercentage =
                  athleteStat['ThreePointersPercentage'];
                curStat.freeThrowsMade = athleteStat['FreeThrowsMade'];
                curStat.freeThrowsAttempted =
                  athleteStat['FreeThrowsAttempted'];
                curStat.freeThrowsPercentage =
                  athleteStat['FreeThrowsPercentage'];
                curStat.minutes = athleteStat['Minutes'];
                curStat.played = athleteStat['Games'];
                curStat.gameDate =
                  athleteStat['DateTime'] !== null
                    ? new Date(utcDate)
                    : athleteStat['DateTime'];
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
                      opponent: opponent,
                      gameDate:
                        athleteStat['DateTime'] !== null
                          ? new Date(utcDate)
                          : athleteStat['DateTime'],
                      statId: athleteStat['StatID'],
                      type: AthleteStatType.DAILY,
                      position: athleteStat['Position'],
                      played: athleteStat['Games'],
                      fantasyScore: athleteStat['FantasyPointsDraftKings'],
                      points: athleteStat['Points'],
                      rebounds: athleteStat['Rebounds'],
                      offensiveRebounds: athleteStat['OffensiveRebounds'],
                      defensiveRebounds: athleteStat['DefensiveRebounds'],
                      assists: athleteStat['Assists'],
                      steals: athleteStat['Steals'],
                      blockedShots: athleteStat['BlockedShots'],
                      turnovers: athleteStat['Turnovers'],
                      personalFouls: athleteStat['PersonalFouls'],
                      fieldGoalsMade: athleteStat['FieldGoalsMade'],
                      fieldGoalsAttempted: athleteStat['FieldGoalsAttempted'],
                      fieldGoalsPercentage: athleteStat['FieldGoalsPercentage'],
                      threePointersMade: athleteStat['ThreePointersMade'],
                      threePointersAttempted:
                        athleteStat['ThreePointersAttempted'],
                      threePointersPercentage:
                        athleteStat['ThreePointersPercentage'],
                      freeThrowsMade: athleteStat['FreeThrowsMade'],
                      freeThrowsAttempted: athleteStat['FreeThrowsAttempted'],
                      freeThrowsPercentage: athleteStat['FreeThrowsPercentage'],
                      minutes: athleteStat['Minutes'],
                    })
                  );
                }
              }
            }

            await AthleteStat.save([...newStats, ...updateStats], {
              chunk: 20,
            });

            this.logger.debug('Update NBA Athlete GameDate Convert: FINISHED');
          } else {
            this.logger.debug('NBA Player Game by Date API: SPORTS DATA ERROR');
          }

          if (timesRun === 12) {
            clearInterval(interval);
          }
        }, 300000);
      }
    } else {
      this.logger.error('NBA Timeframes Data: SPORTS DATA ERROR');
    }
  }

  //@Timeout(1)
  @Interval(3600000) //Runs every 1 hour
  async updateNbaCurrentSeason() {
    this.logger.debug('Update NBA Current Season: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`
    );

    if (status === 200) {
      const newSeason: Timeframe[] = [];
      const updateSeason: Timeframe[] = [];

      const season = data;
      const currSeason = await Timeframe.findOne({
        where: {
          sport: SportType.NBA,
        },
      });

      if (currSeason) {
        currSeason.apiName = season['Description'];
        currSeason.season = season['Season'];
        currSeason.seasonType = getSeasonType(season['SeasonType']);
        currSeason.apiSeason = season['ApiSeason'];
        currSeason.startDate = season['RegularSeasonStartDate'];
        currSeason.endDate = season['PostSeasonStartDate'];
        updateSeason.push(currSeason);
      } else {
        newSeason.push(
          Timeframe.create({
            apiName: season['Description'],
            season: season['Season'],
            seasonType: getSeasonType(season['SeasonType']),
            apiSeason: season['ApiSeason'],
            startDate: season['RegularSeasonStartDate'],
            endDate: season['PostSeasonStartDate'],
            sport: SportType.NBA,
          })
        );
      }

      await Timeframe.save([...newSeason, ...updateSeason], { chunk: 20 });
      this.logger.debug('Update NBA Current Season: FINISHED');
    } else {
      this.logger.debug('Update NBA Current Season: SPORTS DATA ERROR');
    }
  }

  @Interval(4200000) // Runs every 1 hour 10 minutes
  //@Timeout(1)
  async updateNbaSchedules() {
    this.logger.debug('UPDATE NBA Schedules: STARTED');

    const currSeason = await Timeframe.findOne({
      where: { sport: SportType.NBA },
    });

    if (currSeason) {
      const currSchedules = await Schedule.find({
        where: [
          { season: Not(currSeason.season), sport: SportType.NBA },
          { seasonType: Not(currSeason.seasonType), sport: SportType.NBA },
        ],
      });

      if (currSchedules.length > 0) {
        this.logger.debug('Update NBA Schedules: START DELETE PREVIOUS SEASON');
        await Schedule.remove(currSchedules);
        this.logger.debug(
          'Update NBA Schedules: DELETED PREVIOUS SEASON SCHEDULE'
        );
      }

      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nba/scores/json/SchedulesBasic/${currSeason.season}?key=${process.env.SPORTS_DATA_NBA_KEY}`
      );

      if (status === 200) {
        const newSchedule: Schedule[] = [];
        const updateSchedule: Schedule[] = [];

        for (let schedule of data) {
          const gameId: number = schedule['GameID'];

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId, sport: SportType.NBA },
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
            currSchedule.isClosed = schedule['IsClosed'];
            currSchedule.dateTime =
              schedule['DateTime'] !== null
                ? new Date(utcDate)
                : schedule['DateTime'];
            currSchedule.dateTimeUTC = schedule['DateTimeUTC'];
            updateSchedule.push(currSchedule);
          } else {
            newSchedule.push(
              Schedule.create({
                gameId: schedule['GameID'],
                season: schedule['Season'],
                seasonType: schedule['SeasonType'],
                status: schedule['Status'],
                awayTeam: schedule['AwayTeam'],
                homeTeam: schedule['HomeTeam'],
                isClosed: schedule['IsClosed'],
                dateTime:
                  schedule['DateTime'] !== null
                    ? new Date(utcDate)
                    : schedule['DateTime'],
                dateTimeUTC: schedule['DateTimeUTC'],
                sport: SportType.NBA,
              })
            );
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], { chunk: 20 });
      }
      this.logger.debug('Update NBA Schedules: FINISHED');
    } else {
      this.logger.error('Update NBA Schedules: ERROR CURRENT SEASON NOT FOUND');
    }
  }
}
