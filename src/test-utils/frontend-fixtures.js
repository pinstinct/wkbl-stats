import path from "node:path";
import { fileURLToPath } from "node:url";

import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sqlModulePromise;

function toArrayBuffer(uint8) {
  return uint8.buffer.slice(
    uint8.byteOffset,
    uint8.byteOffset + uint8.byteLength,
  );
}

export async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (file) =>
        path.resolve(__dirname, "../../node_modules/sql.js/dist", file),
    });
  }
  return sqlModulePromise;
}

export async function buildFrontendFixtureDbs() {
  const SQL = await getSqlModule();

  const core = new SQL.Database();
  core.exec(`
    CREATE TABLE seasons (id TEXT PRIMARY KEY, label TEXT, start_date TEXT, end_date TEXT);
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT,
      short_name TEXT,
      founded_year INTEGER
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT,
      position TEXT,
      height TEXT,
      birth_date TEXT,
      is_active INTEGER,
      team_id TEXT
    );
    CREATE TABLE games (
      id TEXT PRIMARY KEY,
      season_id TEXT,
      game_date TEXT,
      game_type TEXT,
      home_team_id TEXT,
      away_team_id TEXT,
      home_score INTEGER,
      away_score INTEGER,
      home_q1 INTEGER,
      home_q2 INTEGER,
      home_q3 INTEGER,
      home_q4 INTEGER,
      home_ot INTEGER,
      away_q1 INTEGER,
      away_q2 INTEGER,
      away_q3 INTEGER,
      away_q4 INTEGER,
      away_ot INTEGER,
      venue TEXT
    );
    CREATE TABLE player_games (
      game_id TEXT,
      player_id TEXT,
      team_id TEXT,
      minutes REAL,
      pts REAL,
      reb REAL,
      ast REAL,
      stl REAL,
      blk REAL,
      tov REAL,
      pf REAL,
      fgm INTEGER,
      fga INTEGER,
      tpm INTEGER,
      tpa INTEGER,
      ftm INTEGER,
      fta INTEGER,
      off_reb REAL,
      def_reb REAL
    );
    CREATE TABLE team_games (
      game_id TEXT,
      team_id TEXT,
      pts REAL,
      fga REAL,
      fta REAL,
      oreb REAL,
      tov REAL,
      off_reb REAL
    );
    CREATE TABLE team_standings (
      season_id TEXT,
      team_id TEXT,
      rank INTEGER,
      games_played INTEGER,
      wins INTEGER,
      losses INTEGER,
      win_pct REAL,
      games_behind REAL,
      home_wins INTEGER,
      home_losses INTEGER,
      away_wins INTEGER,
      away_losses INTEGER,
      streak TEXT,
      last5 TEXT
    );
    CREATE TABLE game_predictions (
      game_id TEXT,
      player_id TEXT,
      team_id TEXT,
      is_starter INTEGER,
      predicted_pts REAL
    );
    CREATE TABLE game_team_predictions (
      game_id TEXT,
      home_win_prob REAL,
      away_win_prob REAL,
      home_predicted_pts REAL,
      away_predicted_pts REAL,
      model_version TEXT,
      pregame_generated_at TEXT
    );
    CREATE TABLE game_team_prediction_runs (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      prediction_kind TEXT,
      model_version TEXT,
      generated_at TEXT,
      home_win_prob REAL,
      away_win_prob REAL,
      home_predicted_pts REAL,
      away_predicted_pts REAL
    );
    CREATE TABLE team_category_stats (
      season_id TEXT,
      category TEXT,
      team_id TEXT,
      rank INTEGER,
      value REAL,
      games_played INTEGER,
      extra_values TEXT
    );
    CREATE TABLE head_to_head (
      season_id TEXT,
      team1_id TEXT,
      team2_id TEXT,
      game_date TEXT
    );
    CREATE TABLE game_mvp (
      season_id TEXT,
      player_id TEXT,
      team_id TEXT,
      game_date TEXT,
      rank INTEGER
    );
    CREATE TABLE lineup_stints (
      game_id TEXT,
      team_id TEXT,
      player1_id TEXT,
      player2_id TEXT,
      player3_id TEXT,
      player4_id TEXT,
      player5_id TEXT,
      start_score_for INTEGER,
      start_score_against INTEGER,
      end_score_for INTEGER,
      end_score_against INTEGER,
      duration_seconds INTEGER
    );
  `);

  core.exec(`
    INSERT INTO seasons VALUES ('046', '2025-26', '2025-10-01', '2026-03-31');

    INSERT INTO teams VALUES ('kb', 'KB스타즈', 'KB', 1998);
    INSERT INTO teams VALUES ('samsung', '삼성생명', '삼성', 1998);

    INSERT INTO players VALUES ('p1', '김가드', 'G', '170', '1998-01-01', 1, 'kb');
    INSERT INTO players VALUES ('p2', '박포워드', 'F', '178', '1997-02-02', 1, 'samsung');
    INSERT INTO players VALUES ('p3', '이센터', 'C', '185', '1996-03-03', 1, 'kb');
    INSERT INTO players VALUES ('p4', '최식스맨', 'G', '172', '1999-04-04', 0, 'kb');
    INSERT INTO players VALUES ('p5', '정윙', 'F', '176', '2000-05-05', 1, 'kb');
    INSERT INTO players VALUES ('p6', '윤빅', 'C', '188', '1995-06-06', 1, 'samsung');

    INSERT INTO games VALUES (
      '04601001', '046', '2025-11-01', 'regular', 'kb', 'samsung',
      72, 68, 18, 20, 16, 18, 0, 17, 16, 18, 17, 0, '청주'
    );
    INSERT INTO games VALUES (
      '04601002', '046', '2025-11-08', 'regular', 'samsung', 'kb',
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );

    INSERT INTO player_games VALUES
      ('04601001','p1','kb',34,20,5,6,2,0,3,2,8,15,2,5,2,2,1,4),
      ('04601001','p3','kb',30,14,9,2,1,1,2,3,6,11,0,1,2,3,3,6),
      ('04601001','p5','kb',22,9,4,3,0,0,1,1,3,7,1,3,2,2,1,3),
      ('04601001','p2','samsung',33,19,7,5,1,0,2,2,7,14,3,7,2,2,2,5),
      ('04601001','p6','samsung',31,12,10,1,1,2,3,4,5,10,0,0,2,4,4,6);

    INSERT INTO team_games VALUES
      ('04601001', 'kb', 72, 60, 18, 10, 11, 10),
      ('04601001', 'samsung', 68, 58, 20, 9, 12, 9);

    INSERT INTO team_standings VALUES
      ('046', 'kb', 1, 1, 1, 0, 1.0, 0.0, 1, 0, 0, 0, 'W1', '1-0'),
      ('046', 'samsung', 2, 1, 0, 1, 0.0, 1.0, 0, 1, 0, 0, 'L1', '0-1');

    INSERT INTO game_predictions VALUES
      ('04601002', 'p1', 'kb', 1, 18.5),
      ('04601002', 'p3', 'kb', 1, 12.3),
      ('04601002', 'p2', 'samsung', 1, 17.7);
    INSERT INTO game_team_predictions VALUES (
      '04601002', 56.0, 44.0, 71.0, 67.0, 'v2', '2025-11-07 08:00:00'
    );
    INSERT INTO game_team_prediction_runs VALUES
      (1, '04601002', 'pregame', 'v2', '2025-11-07 08:00:00', 56.0, 44.0, 71.0, 67.0),
      (2, '04601001', 'pregame', 'v2', '2025-10-31 08:00:00', 54.0, 46.0, 74.0, 70.0),
      (3, '04601001', 'backfill', 'v2', '2025-11-03 08:00:00', 30.0, 70.0, 61.0, 79.0);

    INSERT INTO team_category_stats VALUES
      ('046', 'pts', 'kb', 1, 72.0, 1, '[]'),
      ('046', 'pts', 'samsung', 2, 68.0, 1, '[]');

    INSERT INTO head_to_head VALUES ('046', 'kb', 'samsung', '2025-11-01');
    INSERT INTO game_mvp VALUES ('046', 'p1', 'kb', '2025-11-01', 1);

    INSERT INTO lineup_stints VALUES
      ('04601001', 'kb', 'p1', 'p3', 'p5', 'p4', 'p2', 0, 0, 10, 6, 300),
      ('04601001', 'samsung', 'p2', 'p6', 'p1', 'p3', 'p5', 0, 0, 6, 10, 300);
  `);

  const detail = new SQL.Database();
  detail.exec(`
    CREATE TABLE play_by_play (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      event_order INTEGER,
      quarter TEXT,
      game_clock TEXT,
      event_type TEXT,
      team_id TEXT,
      player_id TEXT,
      description TEXT,
      home_score INTEGER,
      away_score INTEGER
    );
    CREATE TABLE shot_charts (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      player_id TEXT,
      team_id TEXT,
      quarter INTEGER,
      game_minute INTEGER,
      game_second INTEGER,
      x REAL,
      y REAL,
      result INTEGER
    );
    CREATE TABLE lineup_stints (
      game_id TEXT,
      team_id TEXT,
      player1_id TEXT,
      player2_id TEXT,
      player3_id TEXT,
      player4_id TEXT,
      player5_id TEXT,
      start_score_for INTEGER,
      start_score_against INTEGER,
      end_score_for INTEGER,
      end_score_against INTEGER,
      duration_seconds INTEGER
    );
    CREATE TABLE position_matchups (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      pos TEXT
    );
  `);

  detail.exec(`
    INSERT INTO play_by_play VALUES
      (1, '04601001', 1, 'Q1', '10:00', 'jumpball', 'kb', 'p1', '시작', 0, 0),
      (2, '04601001', 2, 'Q1', '09:30', 'fgm2', 'kb', 'p1', '2점 성공', 2, 0);
    INSERT INTO shot_charts VALUES
      (1, '04601001', 'p1', 'kb', 1, 9, 30, 10, 5, 1),
      (2, '04601001', 'p2', 'samsung', 1, 8, 55, 22, 11, 0);
    INSERT INTO lineup_stints VALUES
      ('04601001', 'kb', 'p1', 'p3', 'p5', 'p4', 'p2', 0, 0, 10, 6, 300);
    INSERT INTO position_matchups VALUES (1, '04601001', 'G');
  `);

  const full = new SQL.Database(core.export());
  full.exec(`
    CREATE TABLE play_by_play (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      event_order INTEGER,
      quarter TEXT,
      game_clock TEXT,
      event_type TEXT,
      team_id TEXT,
      player_id TEXT,
      description TEXT,
      home_score INTEGER,
      away_score INTEGER
    );
    CREATE TABLE shot_charts (
      id INTEGER PRIMARY KEY,
      game_id TEXT,
      player_id TEXT,
      team_id TEXT,
      quarter INTEGER,
      game_minute INTEGER,
      game_second INTEGER,
      x REAL,
      y REAL,
      result INTEGER
    );
    INSERT INTO play_by_play VALUES
      (1, '04601001', 1, 'Q1', '10:00', 'jumpball', 'kb', 'p1', '시작', 0, 0);
    INSERT INTO shot_charts VALUES
      (1, '04601001', 'p1', 'kb', 1, 9, 30, 10, 5, 1);
  `);

  return {
    SQL,
    coreBuffer: toArrayBuffer(core.export()),
    detailBuffer: toArrayBuffer(detail.export()),
    fullBuffer: toArrayBuffer(full.export()),
  };
}

export function mockFetchResponse({
  ok = true,
  status = 200,
  buffer = new ArrayBuffer(0),
  etag = null,
} = {}) {
  return {
    ok,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === "etag") return etag;
        return null;
      },
    },
    async arrayBuffer() {
      return buffer;
    },
  };
}
