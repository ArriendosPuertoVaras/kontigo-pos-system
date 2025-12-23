chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.create({
        url: 'http://localhost:3000'
    });
});
