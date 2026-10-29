// jsdom의 window.scrollTo는 「Not implemented」 오류를 콘솔에 찍는다. 테스트에서는 스크롤할 것이 없으니 아무것도 하지 않게 한다
if (typeof window !== 'undefined') window.scrollTo = () => {};
