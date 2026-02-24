"""Minimal HTML samples for parser tests, based on WKBL page structures."""

# --- parse_team_record ---

TEAM_RECORD_BASIC = """
<table>
<tr>
    <th>KB스타즈</th>
    <th>구분</th>
    <th>우리은행 위비</th>
</tr>
<tr>
    <td>12</td>
    <td>속공</td>
    <td>8</td>
</tr>
<tr>
    <td>28</td>
    <td>페인트존 점수</td>
    <td>24</td>
</tr>
<tr>
    <td>18</td>
    <td>2점슛 득점</td>
    <td>22</td>
</tr>
<tr>
    <td>15</td>
    <td>3점슛 득점</td>
    <td>12</td>
</tr>
<tr>
    <td>35</td>
    <td>리바운드</td>
    <td>30</td>
</tr>
<tr>
    <td>20</td>
    <td>어시스트</td>
    <td>18</td>
</tr>
<tr>
    <td>5</td>
    <td>스틸</td>
    <td>7</td>
</tr>
<tr>
    <td>3</td>
    <td>블록슛</td>
    <td>2</td>
</tr>
<tr>
    <td>15</td>
    <td>파울</td>
    <td>18</td>
</tr>
<tr>
    <td>10</td>
    <td>턴오버</td>
    <td>12</td>
</tr>
</table>
"""

TEAM_RECORD_EMPTY = "<table><tr><td>A</td></tr></table>"

TEAM_RECORD_BAD_VALUES = """
<table>
<tr>
    <th>삼성생명</th>
    <th>구분</th>
    <th>BNK썸</th>
</tr>
<tr>
    <td>abc</td>
    <td>리바운드</td>
    <td>xyz</td>
</tr>
<tr>
    <td>10</td>
    <td>어시스트</td>
    <td>8</td>
</tr>
</table>
"""

TEAM_RECORD_NO_STATS = """
<table>
<tr>
    <th>하나은행</th>
    <th>구분</th>
    <th>신한은행</th>
</tr>
<tr>
    <td>5</td>
    <td>굿디펜스</td>
    <td>3</td>
</tr>
</table>
"""

# --- parse_player_tables ---

PLAYER_TABLES_BASIC = """
<h4 class="tit_area">KB스타즈</h4>
<table>
<tbody>
<tr>
    <td>박지수</td>
    <td>C</td>
    <td>35:20</td>
    <td>8-15</td>
    <td>0-0</td>
    <td>4-5</td>
    <td>5</td>
    <td>7</td>
    <td>12</td>
    <td>3</td>
    <td>2</td>
    <td>1</td>
    <td>3</td>
    <td>2</td>
    <td>20</td>
</tr>
<tr>
    <td>합계</td>
    <td></td>
    <td>200:00</td>
    <td>30-70</td>
    <td>5-20</td>
    <td>15-20</td>
    <td>10</td>
    <td>25</td>
    <td>35</td>
    <td>18</td>
    <td>15</td>
    <td>8</td>
    <td>12</td>
    <td>5</td>
    <td>80</td>
</tr>
</tbody>
</table>
"""

PLAYER_TABLES_TWO_TEAMS = """
<h4 class="tit_area">삼성생명</h4>
<table>
<tbody>
<tr>
    <td>김선영</td>
    <td>G</td>
    <td>30:00</td>
    <td>5-10</td>
    <td>2-5</td>
    <td>3-4</td>
    <td>1</td>
    <td>3</td>
    <td>4</td>
    <td>5</td>
    <td>2</td>
    <td>2</td>
    <td>1</td>
    <td>0</td>
    <td>15</td>
</tr>
</tbody>
</table>

<h4 class="tit_area">우리은행</h4>
<table>
<tbody>
<tr>
    <td>김아름</td>
    <td>F</td>
    <td>28:30</td>
    <td>4-8</td>
    <td>1-3</td>
    <td>2-2</td>
    <td>2</td>
    <td>5</td>
    <td>7</td>
    <td>2</td>
    <td>3</td>
    <td>1</td>
    <td>2</td>
    <td>1</td>
    <td>11</td>
</tr>
</tbody>
</table>
"""

PLAYER_TABLES_EMPTY = "<h4 class='tit_area'>하나은행</h4><table><tbody></tbody></table>"

PLAYER_TABLES_NO_HEADER = "<table><tbody><tr><td>test</td></tr></tbody></table>"

PLAYER_TABLES_SHORT_ROW = """
<h4 class="tit_area">BNK썸</h4>
<table>
<tbody>
<tr>
    <td>김단비</td>
    <td>G</td>
    <td>25:00</td>
</tr>
</tbody>
</table>
"""

# --- parse_active_player_links ---

ACTIVE_LINKS_BASIC = """
<a href="./detail.asp?pno=095830" class="player-link">
    <span data-kr="박지수"></span>
    <span data-kr="KB스타즈"></span>
</a>
<a href="./detail.asp?pno=096030" class="player-link">
    <span data-kr="김선영"></span>
    <span data-kr="삼성생명"></span>
</a>
"""

ACTIVE_LINKS_BRACKET_TEAM = """
<a href="/player/detail2.asp?pno=095100" class="player-link">
    고아라 [우리은행]
</a>
"""

ACTIVE_LINKS_DEDUP = """
<a href="./detail.asp?pno=095830" class="player-link">
    <span data-kr="박지수"></span>
    <span data-kr="KB스타즈"></span>
</a>
<a href="./detail.asp?pno=095830" class="player-link">
    <span data-kr="박지수"></span>
    <span data-kr="KB스타즈"></span>
</a>
"""

ACTIVE_LINKS_NO_TEAM = """
<a href="./detail.asp?pno=099999" class="player-link">
    <span data-kr="무소속선수"></span>
</a>
"""

ACTIVE_LINKS_ABSOLUTE_URL = """
<a href="https://www.wkbl.or.kr/player/detail.asp?pno=095001" class="player-link">
    <span data-kr="이정은"></span>
    <span data-kr="하나은행"></span>
</a>
"""

ACTIVE_LINKS_SLASH_URL = """
<a href="/player/detail.asp?pno=095002" class="player-link">
    <span data-kr="강이슬"></span>
    <span data-kr="신한은행"></span>
</a>
"""

# --- parse_team_category_stats ---

CATEGORY_STATS_BASIC = """
<table>
<tr><th>순위</th><th>팀</th><th>경기수</th><th>득점</th></tr>
<tr>
    <td>1</td>
    <td>KB스타즈</td>
    <td>30</td>
    <td class='on'>78.5</td>
</tr>
<tr>
    <td>2</td>
    <td>우리은행</td>
    <td>30</td>
    <td class='on'>75.2</td>
</tr>
<tr>
    <td>3</td>
    <td>삼성생명</td>
    <td>30</td>
    <td class='on'>72.1</td>
</tr>
</table>
"""

CATEGORY_STATS_TIED = """
<table>
<tr><th>순위</th><th>팀</th><th>경기수</th><th>리바운드</th></tr>
<tr>
    <td>1</td>
    <td>KB스타즈</td>
    <td>30</td>
    <td class='on'>38.5</td>
</tr>
<tr>
    <td></td>
    <td>삼성생명</td>
    <td>30</td>
    <td class='on'>38.5</td>
</tr>
</table>
"""

CATEGORY_STATS_NO_ON_CLASS = """
<table>
<tr><th>순위</th><th>팀</th><th>경기수</th><th>어시스트</th></tr>
<tr>
    <td>1</td>
    <td>하나은행</td>
    <td>28</td>
    <td>15.2</td>
</tr>
</table>
"""

CATEGORY_STATS_EMPTY = "<table><tr><th>순위</th></tr></table>"

# --- parse_game_mvp ---

GAME_MVP_BASIC = """
<table>ignored1</table>
<table>ignored2</table>
<table>ignored3</table>
<table>
<tr><th>선수명</th><th>일자</th><th>MIN</th><th>FGM-A</th><th>FTM-A</th><th>REB</th><th>AST</th><th>ST</th><th>BS</th><th>TO</th><th>PTS</th><th>EFF</th></tr>
<tr>
    <td><a href="detail.asp?pno=095830" data-kr="박지수"><span data-kr="[KB스타즈]">[KB스타즈]</span></a></td>
    <td>25.11.19</td>
    <td>35:20</td>
    <td>8-15</td>
    <td>4-5</td>
    <td>12</td>
    <td>3</td>
    <td>1</td>
    <td>2</td>
    <td>3</td>
    <td>20</td>
    <td>28.5</td>
</tr>
<tr>
    <td><a href="detail.asp?pno=096030" data-kr="김선영"><span data-kr="[삼성생명]">[삼성생명]</span></a></td>
    <td>25.12.01</td>
    <td>30:00</td>
    <td>6-12</td>
    <td>3-4</td>
    <td>8</td>
    <td>5</td>
    <td>2</td>
    <td>0</td>
    <td>2</td>
    <td>18</td>
    <td>22.0</td>
</tr>
</table>
"""

GAME_MVP_TOO_FEW_TABLES = "<table>only one</table>"

GAME_MVP_NO_PNO = """
<table>t1</table>
<table>t2</table>
<table>t3</table>
<table>
<tr><th>h</th></tr>
<tr>
    <td>선수명 <span data-kr="[BNK썸]">[BNK썸]</span></td>
    <td>25.01.15</td>
    <td>28:00</td>
    <td>5-10</td>
    <td>2-3</td>
    <td>6</td>
    <td>4</td>
    <td>1</td>
    <td>1</td>
    <td>2</td>
    <td>14</td>
    <td>18.0</td>
</tr>
</table>
"""

GAME_MVP_SHORT_ROW = """
<table>t1</table>
<table>t2</table>
<table>t3</table>
<table>
<tr><th>h</th></tr>
<tr>
    <td>선수</td>
    <td>날짜</td>
</tr>
</table>
"""

# --- parse_team_analysis_json ---

TEAM_ANALYSIS_BASIC = """
<script>
var data = JSON.parse('{"matchRecordList":[{"homeTeamCode":"01","awayTeamCode":"03","homeScore1":"20","homeScore2":"18","awayScore1":"15","awayScore2":"22","courtName":"청주체육관"}]}');
</script>
"""

TEAM_ANALYSIS_WITH_VERSUS = """
<script>
var d1 = JSON.parse('{"matchRecordList":[{"courtName":"용인"}]}');
var d2 = JSON.parse('{"versusList":[{"teamCode":"01","win":"3","lose":"1"}]}');
</script>
"""

TEAM_ANALYSIS_INVALID_JSON = """
<script>
var data = JSON.parse('{invalid json}');
</script>
"""

TEAM_ANALYSIS_EMPTY = "<div>no json here</div>"

# --- parse_game_ids ---

GAME_IDS_BASIC = """
<div class="game-card" data-id="04601010">Game 1</div>
<div class="game-card" data-id="04601011">Game 2</div>
<div class="game-card" data-id="04601012">Game 3</div>
"""

GAME_IDS_DUPLICATES = """
<div data-id="04601010">A</div>
<div data-id="04601010">B</div>
<div data-id="04601011">C</div>
"""

GAME_IDS_EMPTY = "<div>No games</div>"

# --- parse_iframe_src / parse_team_iframe_src ---

IFRAME_PLAYER = """
<iframe src="http://datalab.wkbl.or.kr:9001/data_lab/record_player.asp?gameId=04601010&amp;seasonCode=046" width="100%"></iframe>
"""

IFRAME_TEAM = """
<iframe src="http://datalab.wkbl.or.kr:9001/data_lab/record_team.asp?gameId=04601010&amp;seasonCode=046" width="100%"></iframe>
"""

IFRAME_NONE = "<div>no iframe</div>"

# --- standings (used by fetch_team_standings → parse via regex) ---
# The standings are parsed via a POST response with HTML table

STANDINGS_HTML = """
<table>
<tr><th>순위</th><th>팀명</th><th>경기수</th><th>승</th><th>패</th><th>승률</th><th>홈</th><th>원정</th><th>연속</th><th>최근5경기</th></tr>
<tr>
    <td>1</td>
    <td data-kr="KB스타즈">KB스타즈</td>
    <td>30</td>
    <td>22</td>
    <td>8</td>
    <td>.733</td>
    <td>12-3</td>
    <td>10-5</td>
    <td>W3</td>
    <td>4-1</td>
</tr>
<tr>
    <td>2</td>
    <td data-kr="우리은행">우리은행</td>
    <td>30</td>
    <td>20</td>
    <td>10</td>
    <td>.667</td>
    <td>11-4</td>
    <td>9-6</td>
    <td>L1</td>
    <td>3-2</td>
</tr>
</table>
"""
