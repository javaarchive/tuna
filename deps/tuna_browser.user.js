// ==UserScript==
// @name         Tuna browser script
// @namespace    univrsal
// @version      1.0.12
// @description  Get song information from web players, based on NowSniper by Kıraç Armağan Önal
// @author       univrsal
// @match        *://open.spotify.com/*
// @match        *://soundcloud.com/*
// @match        *://music.yandex.com/*
// @match        *://music.yandex.ru/*
// @match        *://www.deezer.com/*
// @match        *://play.pretzel.rocks/*
// @match        *://*.youtube.com/*
// @match        *://app.plex.tv/*
// @grant        unsafeWindow
// @license      GPLv2
// ==/UserScript==

(function() {
    'use strict';
    // Configuration
    var port = 1608;
    var refresh_rate_ms = 500;
    var cooldown_ms = 10000;

    // Tuna isn't running we sleep, because every failed request will log into the console
    // so we don't want to spam it
    var failure_count = 0;
    var cooldown = 0;

    function post(data){
        var url = 'http://localhost:' + port + '/';
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url);

        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Access-Control-Allow-Headers', '*');
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status !== 200) {
                    failure_count++;
                }
            }
        };

        xhr.send(JSON.stringify({data,hostname:window.location.hostname,date:Date.now()}));
    }

    // Safely query something, and perform operations on it
    function query(target, fun, alt = null) {
        var element = document.querySelector(target);
        if (element !== null) {
            return fun(element);
        }
        return alt;
    }

    function timestamp_to_ms(ts) {
        var splits = ts.split(':');
        if (splits.length == 2) {
            return splits[0] * 60 * 1000 + splits[1] * 1000;
        } else if (splits.length == 3) {
            return splits[0] * 60 * 60 * 1000 + splits[1] * 60 * 1000 + splits[0] * 1000;
        }
        return 0;
    }

    function StartFunction() {
        setInterval(()=>{
            if (failure_count > 3) {
                console.log('Failed to connect multiple times, waiting a few seconds');
                cooldown = cooldown_ms;
                failure_count = 0;
            }

            if (cooldown > 0) {
                cooldown -= refresh_rate_ms;
                return;
            }

            let hostname = window.location.hostname;
            // TODO: maybe add more?
            if (hostname === 'soundcloud.com') {
                let status = query('.playControl', e => e.classList.contains('playing') ? "playing" : "stopped", 'unknown');
                let cover_url = query('.playbackSoundBadge span.sc-artwork', e => e.style.backgroundImage.slice(5, -2).replace('t50x50','t500x500'));
                let title = query('.playbackSoundBadge__titleLink', e => e.title);
                let artists = [ query('.playbackSoundBadge__lightLink', e => e.title) ];
                let progress = query('.playbackTimeline__timePassed span:nth-child(2)', e => timestamp_to_ms(e.textContent));
                let duration = query('.playbackTimeline__duration span:nth-child(2)', e => timestamp_to_ms(e.textContent));
                let album_url = query('.playbackSoundBadge__titleLink', e => e.href);
                let album = null;
                // this header only exists on album/set pages so we know this is a full album
                album = query('.fullListenHero .soundTitle__title', e => {
                    album_url = window.location.href;
                    return e.innerText
                })

                album = query('div.playlist.playing', e => {
                    return e.getElementsByClassName('soundTitle__title')[0].innerText;
                })

                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration, album_url, album });
                }
            } else if (hostname === 'open.spotify.com') {
                let status = query('.player-controls [data-testid="control-button-pause"]', e => !!e ? 'playing' : 'stopped', 'unknown');
                let cover_url = query('[data-testid="CoverSlotExpanded__container"] .cover-art-image', e => e.style.backgroundImage.slice(5, -2));
                let title = query('[data-testid="nowplaying-track-link"]', e => e.textContent);
                let artists = query('span[draggable] a[href*="artist"]', e => Array.from(e));
                let progress = query('.playback-bar .playback-bar__progress-time', e => timestamp_to_ms(e[0].textContent));
                let duration = query('.playback-bar .playback-bar__progress-time', e => timestamp_to_ms(e[1].textContent));
                let album_url = query('[data-testid="nowplaying-track-link"]', e => e.href);

                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration, album_url });
                }
            } else if (hostname === 'music.yandex.ru') {
                // Yandex music support by MjKey
                let status = query('.player-controls__btn_play', e => e.classList.contains('player-controls__btn_pause') ? "playing" : "stopped", 'unknown');
                let cover_url = query('.entity-cover__image', e => e.style.backgroundImage.slice(5, -2).replace('50x50','200x200'));
                let title = query('.track__title', e => e.title);
                let artists = [ query('.track__artists', e => e.textContent) ];
                let progress = query('.progress__left', e => timestamp_to_ms(e.textContent));
                let duration = query('.progress__right', e => timestamp_to_ms(e.textContent));
                let album_url = query('.track-cover a', e => e.title);

                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration, album_url });
                }
            } else if (hostname === 'www.youtube.com') {
              let artists = [];

              try {
                artists = [ document.querySelector('#meta-contents').querySelector('#channel-name').innerText.replace('\n', '').trim() ];
              } catch(e) {}

              let title = query('.style-scope.ytd-video-primary-info-renderer', e => {
                let t = e.getElementsByClassName('title');
                if (t && t.length > 0)
                  return t[0].innerText;
                return "";
              });
              let duration = query('video', e => e.duration * 1000);
              let progress = query('video', e => e.currentTime * 1000);
              let cover_url = "";
              let status = query('video', e => e.paused ? 'stopped' : 'playing', 'unknown');
              let regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
              let match = window.location.toString().match(regExp);
              if (match && match[2].length == 11) {
                cover_url = `https://i.ytimg.com/vi/${match[2]}/maxresdefault.jpg`;
              }


              if (title !== null) {
                if (status !== 'stopped') {
                     post({ cover_url, title, artists, status, progress: Math.floor(progress), duration });
                } else {
                  post({ status: 'stopped', title: '', artists: [], progress: 0, duration: 0});
                }
              }
            } else if (hostname === 'music.youtube.com') {
                // Youtube Music support by Rubecks
                const artistsSelectors = [
                    '.ytmusic-player-bar.byline [href*="channel/"]:not([href*="channel/MPREb_"]):not([href*="browse/MPREb_"])', // Artists with links
                    '.ytmusic-player-bar.byline .yt-formatted-string:nth-child(2n+1):not([href*="browse/"]):not([href*="channel/"]):not(:nth-last-child(1)):not(:nth-last-child(3))', // Artists without links
                    '.ytmusic-player-bar.byline [href*="browse/FEmusic_library_privately_owned_artist_detaila_"]', // Self uploaded music
                ];
                const albumSelectors = [
                    '.ytmusic-player-bar [href*="browse/MPREb_"]', // Albums from YTM with links
                    '.ytmusic-player-bar [href*="browse/FEmusic_library_privately_owned_release_detailb_"]', // Self uploaded music
                ];
                let time = query('.ytmusic-player-bar.time-info', e => e.innerText.split(" / "));

                let status = "unknown";
                if (document.querySelector(".ytmusic-player-bar.play-pause-button path[d^='M6 19h4V5H6v14zm8-14v14h4V5h-4z']")) {
                  status = "playing";
                }
                if (document.querySelector(".ytmusic-player-bar.play-pause-button path[d^='M8 5v14l11-7z']")) {
                  status = "stopped"
                }
                let title = query('.ytmusic-player-bar.title', e => e.title);
                let artists = Array.from(document.querySelectorAll(artistsSelectors)).map(x => x.innerText);
                let cover_url = query('.ytmusic-player-bar.thumbnail-image-wrapper img', e => e.src.replace(/=w\d+-h\d+.*/,'=s0?imgmax=0')); // get max resolution
                let album = query(albumSelectors, e => e.textContent);
                let album_url = query(albumSelectors, e => e.href);
                let progress = timestamp_to_ms(time[0]);
                let duration = timestamp_to_ms(time[1]);
                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration, album_url, album });
                }
            } else if (hostname === 'www.deezer.com') {
                let status = query('.player-controls', e => {
                    let buttons = e.getElementsByTagName('button');
                    if (buttons && buttons.length > 1) {
                        if (buttons[1].getAttribute('aria-label') === 'Pause') {
                            return "playing";
                        } else {
                            return "stopped";
                        }
                    }
                    return "unknown";
                });

                let cover_url = query('button.queuelist.is-available', e => {
                    let img = e.getElementsByTagName('img');
                    if (img.length > 0) {
                        let src = img[0].src; // https://e-cdns-images.dzcdn.net/images/cover/c4217689cc86e3e6a289162239424dc3/28x28-000000-80-0-0.jpg
                        return src.replace('28x28', '512x512');
                    }
                    return null;
                });

                let title = query('.marquee-content', e => {
                    let links = e.getElementsByClassName('track-link');
                    if (links.length > 0) {
                        return links[0].textContent;
                    }
                    return null;
                });
                let artists = query('.marquee-content', e => {
                    let links = e.getElementsByClassName('track-link');
                    let artists = [];
                    if (links.length > 1) {
                        for (var i = 1; i < links.length; i++) {
                            artists.push(links[i].textContent);
                        }
                        return artists;
                    }
                    return null;
                });

                let duration = query('.slider-counter-max', e => timestamp_to_ms(e.textContent));
                let progress = query('.slider-counter-current', e => timestamp_to_ms(e.textContent));
                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration });
                }
            } else if (hostname === "play.pretzel.rocks") {
                // Pretzel.rocks support by Tarulia
                // Thanks to Rory from Pretzel for helping out :)

                let status = "unknown";

                if (document.querySelector("[data-testid=pause-button]")) {
                  status = "playing";
                }

                if (document.querySelector("[data-testid=play-button]")) {
                  status = "stopped";
                }

                let cover_url = query('[data-testid=track-artwork]', e => {
                    let img = e.getElementsByTagName('img');
                    if (img.length > 0) {
                        let src = img[0].src; // https://img.pretzel.rocks/artwork/9Mf8m9/medium.jpg
                        return src.replace('medium.jpg', 'large.jpg'); // https://img.pretzel.rocks/artwork/9Mf8m9/large.jpg
                    }
                    return null;
                });

                let title = query('[data-testid=title]', e => {
                    return e.textContent;
                });

                let artists = query('[data-testid=artist]', e => {
                    let elements = e.getElementsByTagName('a');
                    if (elements.length > 0) {
                        let artistArray = [];
                        for (let i = 0; i < elements.length; i++) {
                            artistArray.push(elements[i].textContent);
                        }
                        return artistArray;
                    }
                    return null;
                });

                let album = query('[data-testid=album]', e => {
                    return e.textContent;
                });

                let album_url = query('[data-testid=album]', e => {
                    return e.href;
                });

                let duration = query('[data-testid=track-progress-bar]', e => e.max * 1000);
                let progress = query('[data-testid=track-progress-bar]', e => e.value * 1000);

                if (title !== null) {
                    post({ cover_url, title, artists, status, progress, duration, album_url, album });
                }
            }
        }, refresh_rate_ms);

    }

    StartFunction();
})();
