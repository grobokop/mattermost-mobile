// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {
    Platform,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {intlShape} from 'react-intl';
import * as Animatable from 'react-native-animatable';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import AwesomeIcon from 'react-native-vector-icons/FontAwesome';
import {Navigation} from 'react-native-navigation';

import {
    resetToChannel,
    goToScreen,
    dismissModal,
    dismissAllModals,
    popToRoot,
} from '@actions/navigation';
import FormattedText from '@components/formatted_text';
import Loading from '@components/loading';
import PostList from '@components/post_list';
import PostListRetry from '@components/post_list_retry';
import SafeAreaView from '@components/safe_area_view';
import {marginHorizontal as margin} from '@components/safe_area_view/iphone_x_spacing';
import {General} from '@mm-redux/constants';
import EventEmitter from '@mm-redux/utils/event_emitter';
import {getLastPostIndex} from '@mm-redux/utils/post_list';
import {preventDoubleTap} from '@utils/tap';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

Animatable.initializeRegistryWithDefinitions({
    growOut: {
        from: {
            opacity: 1,
            scale: 1,
        },
        0.5: {
            opacity: 1,
            scale: 3,
        },
        to: {
            opacity: 0,
            scale: 5,
        },
    },
});

export default class Permalink extends PureComponent {
    static propTypes = {
        actions: PropTypes.shape({
            getPostsAround: PropTypes.func.isRequired,
            getPostThread: PropTypes.func.isRequired,
            getChannel: PropTypes.func.isRequired,
            handleSelectChannel: PropTypes.func.isRequired,
            handleTeamChange: PropTypes.func.isRequired,
            joinChannel: PropTypes.func.isRequired,
            selectPost: PropTypes.func.isRequired,
        }).isRequired,
        channelId: PropTypes.string,
        channelIsArchived: PropTypes.bool,
        channelName: PropTypes.string,
        channelTeamId: PropTypes.string,
        currentTeamId: PropTypes.string.isRequired,
        currentUserId: PropTypes.string.isRequired,
        focusedPostId: PropTypes.string.isRequired,
        isPermalink: PropTypes.bool,
        myMembers: PropTypes.object.isRequired,
        onClose: PropTypes.func,
        postIds: PropTypes.array,
        theme: PropTypes.object.isRequired,
        isLandscape: PropTypes.bool.isRequired,
        error: PropTypes.string,
    };

    static defaultProps = {
        postIds: [],
    };

    static contextTypes = {
        intl: intlShape.isRequired,
    };

    constructor(props) {
        super(props);

        const {error, postIds} = props;
        let loading = true;

        if (postIds && postIds.length >= 10) {
            loading = false;
        }

        this.state = {
            title: '',
            loading,
            error: error || '',
            retry: false,
        };
    }

    componentDidMount() {
        this.navigationEventListener = Navigation.events().bindComponent(this);

        this.mounted = true;

        if (this.state.loading && this.props.focusedPostId) {
            this.initialLoad = true;
            this.loadPosts();
        }
    }

    componentDidUpdate() {
        if (this.state.loading && this.props.focusedPostId && !this.initialLoad) {
            this.loadPosts();
        }
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    navigationButtonPressed({buttonId}) {
        if (buttonId === 'backPress') {
            this.handleClose();
        }
    }

    setViewRef = (ref) => {
        this.viewRef = ref;
    }

    goToThread = preventDoubleTap((post) => {
        const {actions} = this.props;
        const channelId = post.channel_id;
        const rootId = (post.root_id || post.id);
        const screen = 'Thread';
        const title = '';
        const passProps = {
            channelId,
            rootId,
        };

        actions.getPostThread(rootId);
        actions.selectPost(rootId);

        goToScreen(screen, title, passProps);
    });

    handleClose = () => {
        const {actions, onClose} = this.props;
        if (this.viewRef) {
            this.mounted = false;
            this.viewRef.zoomOut().then(() => {
                actions.selectPost('');
                dismissModal();

                if (onClose) {
                    onClose();
                }
            });
        }
    };

    handleHashtagPress = () => {
        // Do nothing because we're already in a modal
    };

    handlePermalinkPress = () => {
        // Do nothing because we're already in permalink view for a different post
    };

    handlePress = () => {
        if (this.viewRef) {
            this.viewRef.growOut().then(() => {
                this.jumpToChannel(this.props.channelId);
            });
        }
    };

    jumpToChannel = async (channelId) => {
        if (channelId) {
            const {actions, channelId: currentChannelId, channelTeamId, currentTeamId, onClose} = this.props;
            const {handleSelectChannel, handleTeamChange} = actions;

            actions.selectPost('');

            await dismissAllModals();
            await popToRoot();

            if (channelId === currentChannelId) {
                EventEmitter.emit('reset_channel');
            } else {
                const passProps = {
                    disableTermsModal: true,
                };
                resetToChannel(passProps);
            }

            if (onClose) {
                onClose();
            }

            if (channelTeamId && currentTeamId !== channelTeamId) {
                handleTeamChange(channelTeamId);
            }

            handleSelectChannel(channelId);
        }
    };

    loadPosts = async () => {
        const {intl} = this.context;
        const {actions, channelId, currentUserId, focusedPostId, isPermalink, postIds} = this.props;
        const {formatMessage} = intl;
        let focusChannelId = channelId;

        if (this.mounted && !this.initialLoad) {
            this.setState({loading: false});
        }

        if (focusedPostId) {
            const post = await actions.getPostThread(focusedPostId, false);
            if (post.error && (!postIds || !postIds.length)) {
                const error = post.error.message.toLowerCase() === 'network request failed';
                const connectionError = post.error.details?.message?.toLowerCase() === 'could not connect to the server.';
                if (this.mounted && isPermalink && !error && !connectionError) {
                    this.setState({
                        error: formatMessage({
                            id: 'permalink.error.access',
                            defaultMessage: 'Permalink belongs to a deleted message or to a channel to which you do not have access.',
                        }),
                        title: formatMessage({
                            id: 'permalink.error.link_not_found',
                            defaultMessage: 'Link Not Found',
                        }),
                    });
                } else if (this.mounted) {
                    this.setState({error: post.error.message, retry: true, loading: false});
                }

                return;
            }

            if (!channelId) {
                const focusedPost = post.data && post.data.posts ? post.data.posts[focusedPostId] : null;
                focusChannelId = focusedPost ? focusedPost.channel_id : '';
                if (focusChannelId) {
                    const {data: channel} = await actions.getChannel(focusChannelId);
                    if (!this.props.myMembers[focusChannelId] && channel && channel.type === General.OPEN_CHANNEL) {
                        await actions.joinChannel(currentUserId, channel.team_id, channel.id);
                    }
                }
            }

            await actions.getPostsAround(focusChannelId, focusedPostId, 10);

            if (this.initialLoad) {
                this.initialLoad = false;
                this.setState({loading: false});
            }
        }
    };

    retry = () => {
        if (this.mounted) {
            this.initialLoad = false;
            this.setState({loading: true, error: null, retry: false});
        }
    };

    archivedIcon = () => {
        const style = getStyleSheet(this.props.theme);
        let icon = null;
        if (this.props.channelIsArchived) {
            icon = (
                <Text>
                    <AwesomeIcon
                        name='archive'
                        style={[style.archiveIcon]}
                    />
                    {' '}
                </Text>
            );
        }
        return icon;
    };

    render() {
        const {channelName, currentUserId, focusedPostId, isLandscape, postIds, theme} = this.props;
        const {error, loading, retry, title} = this.state;
        const style = getStyleSheet(theme);

        let postList;
        if (retry) {
            postList = (
                <PostListRetry
                    retry={this.retry}
                    theme={theme}
                />
            );
        } else if (error) {
            postList = (
                <View style={style.errorContainer}>
                    <Text style={style.errorText}>
                        {error}
                    </Text>
                </View>
            );
        } else if (loading) {
            postList = <Loading color={theme.centerChannelColor}/>;
        } else {
            postList = (
                <PostList
                    highlightPostId={focusedPostId}
                    indicateNewMessages={false}
                    isSearchResult={false}
                    shouldRenderReplyButton={false}
                    renderReplies={true}
                    onHashtagPress={this.handleHashtagPress}
                    onPermalinkPress={this.handlePermalinkPress}
                    onPostPress={this.goToThread}
                    postIds={postIds}
                    lastPostIndex={Platform.OS === 'android' ? getLastPostIndex(postIds || []) : -1}
                    currentUserId={currentUserId}
                    lastViewedAt={0}
                    highlightPinnedOrFlagged={false}
                />
            );
        }

        return (
            <SafeAreaView
                backgroundColor='transparent'
                excludeHeader={true}
                footerColor='transparent'
            >
                <View
                    style={[style.container, margin(isLandscape)]}
                >
                    <Animatable.View
                        ref={this.setViewRef}
                        animation='zoomIn'
                        duration={200}
                        delay={0}
                        style={style.wrapper}
                        useNativeDriver={true}
                    >
                        <View
                            style={style.header}
                        >
                            <TouchableOpacity
                                style={style.close}
                                onPress={this.handleClose}
                            >
                                <MaterialIcon
                                    name='close'
                                    size={20}
                                    color={theme.centerChannelColor}
                                />
                            </TouchableOpacity>
                            <View style={style.titleContainer}>
                                <Text
                                    ellipsizeMode='tail'
                                    numberOfLines={1}
                                    style={style.title}
                                >
                                    {this.archivedIcon()}
                                    {title || channelName}
                                </Text>
                            </View>
                        </View>
                        <View style={style.dividerContainer}>
                            <View style={style.divider}/>
                        </View>
                        <View style={[style.postList, error ? style.bottom : null]}>
                            {postList}
                        </View>
                        {!error && !loading &&
                        <TouchableOpacity
                            style={[style.footer, style.bottom]}
                            onPress={this.handlePress}
                        >
                            <FormattedText
                                id='mobile.search.jump'
                                defautMessage='Jump to recent messages'
                                style={style.jump}
                            />
                        </TouchableOpacity>
                        }
                    </Animatable.View>
                </View>
            </SafeAreaView>
        );
    }
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            flex: 1,
            marginTop: 20,
        },
        wrapper: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: 6,
            flex: 1,
            margin: 10,
            opacity: 0,
        },
        header: {
            alignItems: 'center',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            flexDirection: 'row',
            height: 44,
            paddingRight: 16,
            width: '100%',
        },
        dividerContainer: {
            backgroundColor: theme.centerChannelBg,
        },
        divider: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
            height: 1,
        },
        close: {
            justifyContent: 'center',
            height: 44,
            width: 40,
            paddingLeft: 7,
        },
        titleContainer: {
            alignItems: 'center',
            flex: 1,
            paddingRight: 40,
        },
        title: {
            color: theme.centerChannelColor,
            fontSize: 17,
            fontWeight: '600',
        },
        postList: {
            flex: 1,
        },
        bottom: {
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
        },
        footer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.buttonBg,
            flexDirection: 'row',
            height: 43,
            paddingRight: 16,
            width: '100%',
        },
        jump: {
            color: theme.buttonColor,
            fontSize: 15,
            fontWeight: '600',
            textAlignVertical: 'center',
        },
        errorContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: 15,
        },
        errorText: {
            color: changeOpacity(theme.centerChannelColor, 0.4),
            fontSize: 15,
        },
        archiveIcon: {
            color: theme.centerChannelColor,
            fontSize: 16,
            paddingRight: 20,
        },
    };
});
