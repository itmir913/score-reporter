// jsdom의 window.scrollTo는 「Not implemented」 오류를 콘솔에 찍는다. 테스트에서는 스크롤할 것이 없으니 아무것도 하지 않게 한다
if (typeof window !== 'undefined') window.scrollTo = () => {};

// jsdom 캔버스는 context를 주지 않아 Chart.js가 차트를 만들지 않고 이 문구를 찍는다. 이 문구만 거른다
const consoleError = console.error;
console.error = (...args) => {
    if (String(args[0]).startsWith('Failed to create chart: can\'t acquire context')) return;
    consoleError(...args);
};
