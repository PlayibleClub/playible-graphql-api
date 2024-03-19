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
} from './../utils/athlete-ids';
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
export class BaseballService {
  private readonly logger = new Logger(BaseballService.name);
  @Timeout(1)
  async runService() {
    this.logger.debug('Starting baseball service');
  }
  //@Timeout(1)
  async syncMlbData2() {
    const teamCount = await Team.count({
      where: { sport: SportType.MLB },
    });

    if (teamCount === 0) {
      //init mlb teams
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/teams?key=${process.env.SPORTS_DATA_MLB_KEY}`
      );

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team['GlobalTeamID'],
              name: team['Name'],
              key: team['Key'],
              location: team['City'],
              sport: SportType.MLB,
              primaryColor: `#${team['PrimaryColor']}`,
              secondaryColor: `#${team['SecondaryColor']}`,
            }).save();
          } catch (err) {
            this.logger.error(err);
          }
        }
      } else {
        this.logger.error('MLB Teams Data: SPORTS DATA ERROR');
      }
    }
    this.logger.debug(`MLB Teams: ${teamCount ? 'ALREADY EXISTS' : 'SYNCED'}`);

    const athleteCount = await Athlete.count({
      where: { team: { sport: SportType.MLB } },
    });

    if (athleteCount === 0) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`
      );
      if (status === 200) {
        for (let athlete of data) {
          if (MLB_ATHLETE_IDS.includes(athlete['PlayerID'])) {
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
            } catch (err) {
              this.logger.error(err);
            }
          }
        }
      } else {
        this.logger.error('MLB Athlete: SPORTS DATA ERROR');
      }
    } else {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`
      );
      if (status === 200) {
        const newAthlete: Athlete[] = [];
        const updateAthlete: Athlete[] = [];
        for (let athlete of data) {
          if (MLB_ATHLETE_IDS.includes(athlete['PlayerID'])) {
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
          }
        }
        await Athlete.save([...newAthlete, ...updateAthlete], { chunk: 20 });
        this.logger.debug('MLB Athlete: UPDATED ');

        const athleteCount = await Athlete.count({
          where: { team: { sport: SportType.MLB } },
        });
        this.logger.debug('CURRENT MLB ATHLETE COUNT: ' + athleteCount);
      } else {
        this.logger.error('MLB Athlete: SPORTS DATA ERROR');
      }
    }
    this.logger.debug(
      `MLB Athlete: ${athleteCount ? 'ALREADY EXISTS' : 'SYNCED'}`
    );
  }

  @Timeout(300000)
  async generateAthleteMlbAssets() {
    this.logger.debug('Generate Athlete MLB Assets: STARTED');

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS),
        team: { sport: SportType.MLB },
      },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/mlb-svg-teams-templates/${athlete.team.key}.svg`,
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
      const s3_location = 'media/athlete/mlb/images/';
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
          let image = data['Location'];
          if (image.contains('playible-api-production.s3.amazonaws.com')) {
            athlete.nftImage = image.replace(
              'playible-api-production.s3.amazonaws.com',
              'images.playible.io'
            );
          } else if (
            image.contains(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com'
            )
          ) {
            athlete.nftImage = image.replace(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com',
              'images.playible.io'
            );
          }

          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete MLB Assets: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }
  @Timeout(450000)
  async generateAthleteMlbAssetsAnimation() {
    this.logger.debug('Generate Athlete MLB Assets Animation: STARTED');

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS),
        team: { sport: SportType.MLB },
      },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(
        `./src/utils/mlb-svg-teams-animation-templates/${athlete.team.key}.svg`,
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

        result.svg.g[4].text[0].tspan['_cdata'] =
          athlete.position.toUpperCase();
        result.svg.g[4].text[1].tspan['_cdata'] =
          athlete.position.toUpperCase();
        result.svg.g[4].text[2].tspan['_cdata'] =
          athlete.firstName.toUpperCase();
        result.svg.g[4].text[3].tspan['_cdata'] =
          athlete.firstName.toUpperCase();
        result.svg.g[4].text[4].tspan['_cdata'] =
          athlete.lastName.toUpperCase();
        result.svg.g[4].text[5].tspan['_cdata'] =
          athlete.lastName.toUpperCase();
        result = convert.js2xml(result, options);
      } catch (e) {
        console.log(
          `FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`
        );
        console.log(e);
      }

      // fs.writeFileSync(
      //   `./nfl-animations/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName
      //   .toLowerCase()}.svg`,
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
      const s3_location = 'media/athlete/mlb/animations/';
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
          let image = data['Location'];
          if (image.contains('playible-api-production.s3.amazonaws.com')) {
            athlete.nftAnimation = image.replace(
              'playible-api-production.s3.amazonaws.com',
              'images.playible.io'
            );
          } else if (
            image.contains(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com'
            )
          ) {
            athlete.nftAnimation = image.replace(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com',
              'images.playible.io'
            );
          }
          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete MLB Assets Animations: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  @Timeout(600000)
  async generateAthleteMlbAssetsPromo() {
    this.logger.debug('Generate Athlete MLB Assets Promo: STARTED');

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS),
        team: { sport: SportType.MLB },
      },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/mlb-svg-teams-promo-templates/${athlete.team.key}.svg`,
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
      const s3_location = 'media/athlete/mlb/promo_images/';
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
          let image = data['Location'];
          if (image.contains('playible-api-production.s3.amazonaws.com')) {
            athlete.nftImagePromo = image.replace(
              'playible-api-production.s3.amazonaws.com',
              'images.playible.io'
            );
          } else if (
            image.contains(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com'
            )
          ) {
            athlete.nftImagePromo = image.replace(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com',
              'images.playible.io'
            );
          }
          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete MLB Assets Promo: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  //@Timeout(1)
  @Interval(86400000) //runs every 1 day
  async updateMlbAthleteHeadshots() {
    this.logger.debug('Update Athlete MLB Headshots: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/headshots/json/Headshots?key=${process.env.SPORTS_DATA_MLB_KEY}`
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
      this.logger.debug('Update Athlete MLB Headshots: FINISHED');
    } else {
      this.logger.error('MLB Athlete Headshot Data: SPORTS DATA ERROR');
    }
  }

  @Timeout(750000)
  async generateAthleteMlbAssetsLocked() {
    this.logger.debug('Generate Athlete MLB Assets Locked: STARTED');

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS),
        team: { sport: SportType.MLB },
      },
      relations: {
        team: true,
      },
    });

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(
        `./src/utils/mlb-svg-teams-lock-templates/${athlete.team.key}.svg`,
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
      const s3_location = 'media/athlete/mlb/locked_images/';
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
          let image = data['Location'];
          if (image.contains('playible-api-production.s3.amazonaws.com')) {
            athlete.nftImageLocked = image.replace(
              'playible-api-production.s3.amazonaws.com',
              'images.playible.io'
            );
          } else if (
            image.contains(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com'
            )
          ) {
            athlete.nftImageLocked = image.replace(
              'playible-api-production.s3.ap-southeast-1.amazonaws.com',
              'images.playible.io'
            );
          }
          await Athlete.save(athlete);
        }
      });
    }

    this.logger.debug('Generate Athlete MLB Assets Locked: FINISHED');
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`);
  }

  @Interval(3600000) // runs every 1 hour
  async updateMlbAthleteInjuryStatus() {
    this.logger.debug('Update MLB Athlete Injury Status: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`
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

  @Interval(900000) // runs every 15 minutes
  async updateMlbAthleteStatsPerSeason() {
    this.logger.debug('Update MLB Athlete Stats (Season): STARTED');

    // const timeframe = await Timeframe.findOne({
    //   where: {
    //     sport: SportType.MLB
    //   }
    // })
    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`
    );

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data;

      if (timeFrame) {
        const season = timeFrame.ApiSeason;
        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}mlb/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_MLB_KEY}`
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
              //updating stats
              curStat.fantasyScore =
                athleteStat['FantasyPointsDraftKings'] / numberOfGames;
              curStat.atBats = athleteStat['AtBats'] / numberOfGames;
              curStat.runs = athleteStat['Runs'] / numberOfGames;
              curStat.hits = athleteStat['Hits'] / numberOfGames;
              curStat.singles = athleteStat['Singles'] / numberOfGames;
              curStat.doubles = athleteStat['Doubles'] / numberOfGames;
              curStat.triples = athleteStat['Triples'] / numberOfGames;
              curStat.homeRuns = athleteStat['HomeRuns'] / numberOfGames;
              curStat.runsBattedIn =
                athleteStat['RunsBattedIn'] / numberOfGames;
              curStat.battingAverage = athleteStat['BattingAverage'];
              curStat.strikeouts = athleteStat['Strikeouts'] / numberOfGames;
              curStat.walks = athleteStat['Walks'] / numberOfGames;
              curStat.caughtStealing =
                athleteStat['CaughtStealing'] / numberOfGames;
              curStat.onBasePercentage = athleteStat['OnBasePercentage'];
              curStat.sluggingPercentage = athleteStat['SluggingPercentage'];
              curStat.onBasePlusSlugging =
                athleteStat['OnBasePlusSlugging'] / numberOfGames;
              curStat.wins = athleteStat['Wins'] / numberOfGames;
              curStat.losses = athleteStat['Losses'] / numberOfGames;
              curStat.earnedRunAverage = athleteStat['EarnedRunAverage'];
              curStat.hitByPitch = athleteStat['HitByPitch'] / numberOfGames;
              curStat.stolenBases = athleteStat['StolenBases'] / numberOfGames;
              curStat.walksHitsPerInningsPitched =
                athleteStat['WalksHitsPerInningsPitched'];
              curStat.pitchingBattingAverageAgainst =
                athleteStat['PitchingBattingAverageAgainst'];
              curStat.pitchingHits =
                athleteStat['PitchingHits'] / numberOfGames;
              curStat.pitchingRuns =
                athleteStat['PitchingRuns'] / numberOfGames;
              curStat.pitchingEarnedRuns =
                athleteStat['PitchingEarnedRuns'] / numberOfGames;
              curStat.pitchingWalks =
                athleteStat['PitchingWalks'] / numberOfGames;
              curStat.pitchingHomeRuns =
                athleteStat['PitchingHomeRuns'] / numberOfGames;
              curStat.pitchingStrikeouts =
                athleteStat['PitchingStrikeouts'] / numberOfGames;
              curStat.pitchingCompleteGames =
                athleteStat['PitchingCompleteGames'] / numberOfGames;
              curStat.pitchingShutouts =
                athleteStat['PitchingShutOuts'] / numberOfGames;
              curStat.pitchingNoHitters =
                athleteStat['PitchingNoHitters'] / numberOfGames;
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
                    statId: athleteStat['StatID'],
                    fantasyScore:
                      athleteStat['FantasyPointsDraftKings'] / numberOfGames,
                    atBats: athleteStat['AtBats'] / numberOfGames,
                    runs: athleteStat['Runs'] / numberOfGames,
                    hits: athleteStat['Hits'] / numberOfGames,
                    singles: athleteStat['Singles'] / numberOfGames,
                    doubles: athleteStat['Doubles'] / numberOfGames,
                    triples: athleteStat['Triples'] / numberOfGames,
                    homeRuns: athleteStat['HomeRuns'] / numberOfGames,
                    runsBattedIn: athleteStat['RunsBattedIn'] / numberOfGames,
                    battingAverage: athleteStat['BattingAverage'],
                    strikeouts: athleteStat['Strikeouts'] / numberOfGames,
                    walks: athleteStat['Walks'] / numberOfGames,
                    caughtStealing:
                      athleteStat['CaughtStealing'] / numberOfGames,
                    onBasePercentage:
                      athleteStat['OnBasePercentage'] / numberOfGames,
                    sluggingPercentage:
                      athleteStat['SluggingPercentage'] / numberOfGames,
                    wins: athleteStat['Wins'] / numberOfGames,
                    losses: athleteStat['Losses'] / numberOfGames,
                    earnedRunAverage: athleteStat['EarnedRunAverage'],
                    hitByPitch: athleteStat['HitByPitch'] / numberOfGames,
                    stolenBases: athleteStat['StolenBases'] / numberOfGames,
                    walksHitsPerInningsPitched:
                      athleteStat['WalksHitsPerInningsPitched'],
                    pitchingBattingAverageAgainst:
                      athleteStat['PitchingBattingAverageAgainst'],
                    pitchingHits: athleteStat['PitchingHits'],
                    pitchingRuns: athleteStat['PitchingRuns'],
                    pitchingEarnedRuns: athleteStat['PitchingEarnedRuns'],
                    pitchingWalks: athleteStat['PitchingWalks'],
                    pitchingHomeRuns: athleteStat['PitchingHomeRuns'],
                    pitchingStrikeouts:
                      athleteStat['PitchingStrikeouts'] / numberOfGames,
                    pitchingCompleteGames:
                      athleteStat['PitchingCompleteGames'] / numberOfGames,
                    pitchingShutouts:
                      athleteStat['PitchingShutOuts'] / numberOfGames,
                    pitchingNoHitters:
                      athleteStat['PitchingNoHitters'] / numberOfGames,
                  })
                );
              }
            }
          }
          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });
          this.logger.debug('Update MLB Athlete Stats (Season): FINISHED');
        } else {
          this.logger.debug(
            'Update MLB Athlete Stats (Season): SPORTS DATA ERROR'
          );
        }
      } else {
        this.logger.debug(
          'Update MLB Athlete Stats (Season): NO CURRENT SEASON FOUND'
        );
      }
    }
  }
  //@Timeout(1)
  @Interval(300000) // runs every 5 minutes
  async updateMlbAthleteStatsPerDay() {
    this.logger.debug('Update MLB Athlete Stats Per Day: STARTED');

    //change this later to same with NBA
    // const timeFrame = await Timeframe.findOne({
    //   where: {
    //     sport: SportType.MLB
    //   }
    // })
    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`
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

        this.logger.debug('MLB - ' + dateFormat);

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}mlb/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_MLB_KEY}`
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
              curStat.fantasyScore =
                apiId === 10008667
                  ? computeShoheiOhtaniScores(athleteStat)
                  : athleteStat['FantasyPointsDraftKings'];
              curStat.atBats = athleteStat['AtBats'];
              curStat.runs = athleteStat['Runs'];
              curStat.hits = athleteStat['Hits'];
              curStat.singles = athleteStat['Singles'];
              curStat.doubles = athleteStat['Doubles'];
              curStat.triples = athleteStat['Triples'];
              curStat.homeRuns = athleteStat['HomeRuns'];
              curStat.runsBattedIn = athleteStat['RunsBattedIn'];
              curStat.battingAverage = athleteStat['BattingAverage'];
              curStat.strikeouts = athleteStat['Strikeouts'];
              curStat.walks = athleteStat['Walks'];
              curStat.caughtStealing = athleteStat['CaughtStealing'];
              curStat.onBasePercentage = athleteStat['OnBasePercentage'];
              curStat.sluggingPercentage = athleteStat['SluggingPercentage'];
              curStat.onBasePlusSlugging = athleteStat['OnBasePlusSlugging'];
              curStat.wins = athleteStat['Wins'];
              curStat.losses = athleteStat['Losses'];
              curStat.earnedRunAverage = athleteStat['EarnedRunAverage'];
              curStat.hitByPitch = athleteStat['HitByPitch'];
              curStat.stolenBases = athleteStat['StolenBases'];
              curStat.walksHitsPerInningsPitched =
                athleteStat['WalksHitsPerInningsPitched'];
              curStat.pitchingBattingAverageAgainst =
                athleteStat['PitchingBattingAverageAgainst'];
              curStat.pitchingHits = athleteStat['PitchingHits'];
              curStat.pitchingRuns = athleteStat['PitchingRuns'];
              curStat.pitchingEarnedRuns = athleteStat['PitchingEarnedRuns'];
              curStat.pitchingWalks = athleteStat['PitchingWalks'];
              curStat.pitchingHomeRuns = athleteStat['PitchingHomeRuns'];
              curStat.pitchingStrikeouts = athleteStat['PitchingStrikeouts'];
              curStat.pitchingCompleteGames =
                athleteStat['PitchingCompleteGames'];
              curStat.pitchingShutouts = athleteStat['PitchingShutOuts'];
              curStat.pitchingNoHitters = athleteStat['PitchingNoHitters'];
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
                    type: AthleteStatType.DAILY,
                    statId: athleteStat['StatID'],
                    position: athleteStat['Position'],
                    played: athleteStat['Games'],
                    fantasyScore:
                      apiId === 10008667
                        ? computeShoheiOhtaniScores(athleteStat)
                        : athleteStat['FantasyPointsDraftKings'],
                    atBats: athleteStat['AtBats'],
                    runs: athleteStat['Runs'],
                    hits: athleteStat['Hits'],
                    singles: athleteStat['Singles'],
                    doubles: athleteStat['Doubles'],
                    triples: athleteStat['Triples'],
                    homeRuns: athleteStat['HomeRuns'],
                    runsBattedIn: athleteStat['RunsBattedIn'],
                    battingAverage: athleteStat['BattingAverage'],
                    strikeouts: athleteStat['Strikeouts'],
                    walks: athleteStat['Walks'],
                    caughtStealing: athleteStat['CaughtStealing'],
                    onBasePercentage: athleteStat['OnBasePercentage'],
                    sluggingPercentage: athleteStat['SluggingPercentage'],
                    wins: athleteStat['Wins'],
                    losses: athleteStat['Losses'],
                    earnedRunAverage: athleteStat['EarnedRunAverage'],
                    hitByPitch: athleteStat['HitByPitch'],
                    stolenBases: athleteStat['StolenBases'],
                    walksHitsPerInningsPitched:
                      athleteStat['WalksHitsPerInningsPitched'],
                    pitchingBattingAverageAgainst:
                      athleteStat['PitchingBattingAverageAgainst'],
                    pitchingHits: athleteStat['PitchingHits'],
                    pitchingRuns: athleteStat['PitchingRuns'],
                    pitchingEarnedRuns: athleteStat['PitchingEarnedRuns'],
                    pitchingWalks: athleteStat['PitchingWalks'],
                    pitchingHomeRuns: athleteStat['PitchingHomeRuns'],
                    pitchingStrikeouts: athleteStat['PitchingStrikeouts'],
                    pitchingCompleteGames: athleteStat['PitchingCompleteGames'],
                    pitchingShutouts: athleteStat['PitchingShutOuts'],
                    pitchingNoHitters: athleteStat['PitchingNoHitters'],
                  })
                );
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 });
          this.logger.debug('Update MLB Athlete Stats (Daily): FINISHED');
        } else {
          this.logger.debug(
            'Update MLB Athlete Stats (Daily): SPORTS DATA ERROR'
          );
          if (Object.keys(data).length === 0) {
            this.logger.debug(
              'Update MLB Athlete Stats (Daily): EMPTY DATA RESPONSE'
            );
          }
        }
      } else {
        this.logger.debug(
          'Update MLB Athlete Stats (Daily): NO CURRENT SEASON'
        );
      }
    }
  }
  @Interval(3600000) // runs every 1 hour
  async updateMlbCurrentSeason() {
    this.logger.debug('Update MLB Current Season: STARTED');

    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`
    );

    if (status === 200) {
      const newSeason: Timeframe[] = [];
      const updateSeason: Timeframe[] = [];

      const season = data;
      const currSeason = await Timeframe.findOne({
        where: {
          sport: SportType.MLB,
        },
      });

      if (currSeason) {
        currSeason.season = season['Season'];
        currSeason.seasonType = getSeasonType(season['SeasonType']);
        currSeason.apiSeason = season['ApiSeason'];
        currSeason.startDate = season['RegularSeasonStartDate'];
        currSeason.endDate = season['PostSeasonStartDate'];
        updateSeason.push(currSeason);
      } else {
        newSeason.push(
          Timeframe.create({
            season: season['Season'],
            seasonType: getSeasonType(season['SeasonType']),
            apiSeason: season['ApiSeason'],
            startDate: season['RegularSeasonStartDate'],
            endDate: season['PostSeasonStartDate'],
            sport: SportType.MLB,
          })
        );
      }
      await Timeframe.save([...newSeason, ...updateSeason], { chunk: 20 });
      this.logger.debug('Update MLB Current Season: FINISHED');
    } else {
      this.logger.debug('Update MLB Current Season: SPORTS DATA ERROR');
    }
  }
  @Interval(4200000) // runs every 1 hour 20 minutes
  async updateMlbSchedules() {
    this.logger.debug('UPDATE MLB Schedules: STARTED');

    const currSeason = await Timeframe.findOne({
      where: { sport: SportType.MLB },
    });

    if (currSeason) {
      const currSchedules = await Schedule.find({
        where: [
          { season: Not(currSeason.season), sport: SportType.MLB },
          { seasonType: Not(currSeason.seasonType), sport: SportType.MLB },
        ],
      });

      if (currSchedules.length > 0) {
        this.logger.debug(
          'Update MLB Schedules: START DELETE PREVIOUS SEASON SCHEDULE'
        );
        await Schedule.remove(currSchedules);
        this.logger.debug(
          'Update MLB Schedules: DELETED PREVIOUS SEASON SCHEDULE'
        );
      }

      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}mlb/scores/json/Games/${currSeason.apiSeason}?key=${process.env.SPORTS_DATA_MLB_KEY}`
      );

      if (status === 200) {
        const newSchedule: Schedule[] = [];
        const updateSchedule: Schedule[] = [];

        for (let schedule of data) {
          const gameId: number = schedule['GameID'];

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId, sport: SportType.MLB },
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
                sport: SportType.MLB,
              })
            );
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], { chunk: 20 });
      }
      this.logger.debug('Update MLB Schedules: FINISHED');
    } else {
      this.logger.error('Update MLB Schedules: ERROR CURRENT SEASON NOT FOUND');
    }
  }
}
