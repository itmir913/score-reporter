/* 애플리케이션 진입점.
 *
 * 분리 전에는 index.html이 <script> 태그 14개로 앱 파일을 순서대로 읽어들이고,
 * 모든 함수가 전역에 놓이는 구조였다. 지금은 ES 모듈이라 파일마다 스코프가 따로
 * 있으므로, HTML에 인라인으로 박힌 onclick 등이 부르는 함수만 여기서 window에
 * 다시 올려준다. 인라인 핸들러는 전역 스코프에서만 이름을 찾기 때문이다.
 *
 * 아래 목록은 index.html의 on* 속성과, JS가 문자열로 만들어 innerHTML에 넣는
 * 마크업의 on* 속성을 훑어서 뽑은 것이다. 하나라도 빠지면 눌렀을 때
 * ReferenceError가 난다. 인라인 핸들러를 addEventListener로 옮기면 이 파일의
 * window 노출은 통째로 없앨 수 있다.
 */
import './styles/main.css';

// import 순서는 분리 전 index.html의 <script> 순서를 그대로 따른다.
import './js/utils.js';
import './js/schema.js';
import './js/parser.js';
import './js/exporter.js';
import './js/report/report-cache.js';
import './js/report/report-render-stats.js';
import './js/report/report-render-topN.js';
import {renderScoreDistribution} from './js/report/report-score-distribution.js';
import './js/report/report-subject-selection.js';
import {handleClassChange} from './js/report/report-csat-sum.js';
import {renderSubjectsCharts} from './js/report/report-render-chart-subjects.js';
import {closeModal, handleRowClick, printStudentDetail, showCsatStudents, showSelectedSubjectStudents} from './js/report/report-modal.js';
import {renderAll, setGlobalBasis} from './js/report.js';
import {clearFile, exportTo, handleDragLeave, handleDragOver, handleDrop, handleFileSelect, loadSampleData, parseData, renderRawPreview, selectFormat, switchTab} from './js/main.js';

Object.assign(window, {
    clearFile,
    closeModal,
    exportTo,
    handleClassChange,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    handleRowClick,
    loadSampleData,
    parseData,
    printStudentDetail,
    renderAll,
    renderRawPreview,
    renderScoreDistribution,
    renderSubjectsCharts,
    selectFormat,
    setGlobalBasis,
    showCsatStudents,
    showSelectedSubjectStudents,
    switchTab,
});
