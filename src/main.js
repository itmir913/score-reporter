/* 애플리케이션 진입점.
 *
 * 스타일과 앱 모듈을 불러온 뒤, 마크업의 data-action / data-change 를 실제
 * 함수에 잇는다. 잇는 규칙은 js/actions.js 에 모아 두었다.
 *
 * 분리 전에는 index.html이 <script> 태그 14개로 앱 파일을 순서대로 읽어들이고
 * 모든 함수가 전역에 놓이는 구조였다. 그 흔적으로 한동안 함수 21개를 window에
 * 다시 올려 줬는데, 인라인 핸들러를 걷어내면서 그 필요가 없어졌다.
 */
import './styles/main.css';

// import 순서는 분리 전 index.html의 <script> 순서를 그대로 따른다.
// report.js와 report-modal.js는 불러오는 것만으로 resize·keydown 리스너를 건다.
import './js/utils.js';
import './js/schema.js';
import './js/parser.js';
import './js/exporter.js';
import './js/report/report-cache.js';
import './js/report/report-render-stats.js';
import './js/report/report-render-topN.js';
import './js/report/report-score-distribution.js';
import './js/report/report-subject-selection.js';
import './js/report/report-csat-sum.js';
import './js/report/report-render-chart-subjects.js';
import './js/report/report-modal.js';
import './js/report.js';
import './js/main.js';

import {initActions} from './js/actions.js';

initActions();
