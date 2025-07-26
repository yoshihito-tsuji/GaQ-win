import React, { useState, useRef } from 'react';
import CheckboxButton from './CheckboxButton';

// セキュアなElectron API使用
const electronAPI = window.electronAPI || {};

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'];

const MODEL_INFO = {
  tiny: {
    displayName: '超軽量 (TINY)',
    subtitle: '最速処理に最適',
    description: '処理速度を重視、短い音声や簡単な内容向け'
  },
  base: {
    displayName: '標準 (BASE)',
    subtitle: 'バランス重視',
    description: '速度と品質のバランスが良い、一般的な用途に最適'
  },
  small: {
    displayName: '高品質 (SMALL)',
    subtitle: 'しっかりとした文字起こしに',
    description: '高い精度で長い音声や複雑な内容にも対応'
  },
  medium: {
    displayName: '高精度 (MEDIUM)',
    subtitle: '専門的な内容に',
    description: '非常に高い精度、専門用語や技術的な内容に最適'
  },
  large: {
    displayName: '最高品質 (LARGE)',
    subtitle: 'プロフェッショナル向け',
    description: '最高の精度を実現、業務用途に最適'
  }
};

function TranscriptionScreen({ onNavigateToSettings, onShowInitialInfo, onTranscriptionStateChange }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState(new Set());
  const [localSettings, setLocalSettings] = useState({
    modelSize: 'base',
    speakerDetection: true,
    playBellSound: true,
    setupCompleted: true
  });
  
  const fileInputRef = useRef(null);
  
  // 初回起動時に設定を読み込み
  React.useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const response = electronAPI.config ? await electronAPI.config.getSettings() : null;
        if (response && response.settings) {
          console.log('読み込んだ設定:', response.settings);
          setLocalSettings(response.settings);
        }
      } catch (error) {
        console.error('設定読み込みエラー:', error);
      }
    };
    loadInitialSettings();
  }, []);

  // ダウンロード済みモデルを確認
  React.useEffect(() => {
    const loadModels = async () => {
      try {
        const models = electronAPI.getDownloadedModels ? await electronAPI.getDownloadedModels() : [];
        console.log('取得したモデルリスト:', models);
        console.log('現在の設定モデル:', localSettings.modelSize);
        
        // セットアップ完了後は、設定されたモデルを利用可能として扱う
        const availableModels = new Set(models || []);
        if (localSettings.setupCompleted && localSettings.modelSize) {
          availableModels.add(localSettings.modelSize);
          console.log('セットアップ完了済み - モデルを利用可能として追加:', localSettings.modelSize);
        }
        
        setDownloadedModels(availableModels);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();
  }, [localSettings.setupCompleted, localSettings.modelSize]); // setupCompletedとmodelSizeの変更時にも実行

  // ファイル選択ハンドラー
  const handleFileSelect = (file) => {
    if (!file) return;
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(fileExtension)) {
      setError(`対応していないファイル形式です。対応形式: ${AUDIO_EXTENSIONS.join(', ')}`);
      return;
    }
    
    setSelectedFile(file);
    setError('');
    setTranscriptionResult('');
    setSuccessMessage('');
    setCopyMessage('');
  };

  // ドラッグ&ドロップハンドラー
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // ファイル入力ハンドラー
  const handleFileInputChange = (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // 文字起こし実行
  const handleTranscribe = async () => {
    if (!selectedFile) return;
    
    console.log('文字起こし開始'); // デバッグ用ログ
    console.log('onTranscriptionStateChange関数:', onTranscriptionStateChange); // デバッグ追加
    setIsTranscribing(true);
    
    // 親コンポーネントに文字起こし開始を通知
    if (onTranscriptionStateChange) {
      console.log('親コンポーネントに文字起こし開始を通知'); // デバッグ追加
      onTranscriptionStateChange(true);
    } else {
      console.warn('onTranscriptionStateChange関数が渡されていません'); // デバッグ追加
    }
    
    setProgress(0);
    setProgressText('準備中...');
    setError('');
    setTranscriptionResult('');
    setCopyMessage('');
    
    try {
      // システムチェックを実行
      setProgressText('システム要件をチェック中...');
      const systemCheck = await electronAPI.system.checkSystem(localSettings.modelSize).catch(() => ({ success: false }));
      
      if (systemCheck.success && systemCheck.systemCheck) {
        const checkResult = systemCheck.systemCheck;
        
        if (checkResult.status === 'failed') {
          const errorMessage = checkResult.issues.join('\\n');
          const suggestions = systemCheck.suggestions || [];
          const suggestionText = suggestions.length > 0 ? `\\n\\n推奨対処法:\\n${suggestions.join('\\n')}` : '';
          
          setError(`システムチェックエラー:\\n${errorMessage}${suggestionText}`);
          return;
        } else if (checkResult.status === 'warning') {
          console.warn('システムチェック警告:', checkResult.warnings);
        }
      }
      
      console.log('Electronに文字起こしリクエスト送信:', {
        filePath: selectedFile.path,
        modelSize: localSettings.modelSize,
        speakerDetection: localSettings.speakerDetection,
        playBellSound: localSettings.playBellSound
      }); // デバッグ用ログ
      
      setProgressText('文字起こしを開始中...');
      const result = await electronAPI.transcribeAudio({
        filePath: selectedFile.path,
        options: {
          modelSize: localSettings.modelSize,
          speakerDetection: localSettings.speakerDetection,
          playBellSound: localSettings.playBellSound
        }
      });
      
      console.log('文字起こし結果:', result); // デバッグ用ログ
      
      if (result.success) {
        setTranscriptionResult(result.text);
        setSuccessMessage('✅ 文字起こしが完了しました！');
        if (localSettings.playBellSound) {
          // ベル音を鳴らす
          new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE').play();
        }
      } else {
        setError(result.error || '文字起こしに失敗しました');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      setError(`エラーが発生しました: ${err.message}`);
    } finally {
      setIsTranscribing(false);
      
      // 親コンポーネントに文字起こし終了を通知
      if (onTranscriptionStateChange) {
        onTranscriptionStateChange(false);
      }
      
      setProgress(0);
      setProgressText('');
    }
  };

  // 進捗更新を受信
  React.useEffect(() => {
    const handleProgress = (data) => {
      console.log('進捗データを受信:', data); // デバッグ用ログ
      setProgress(data.progress || 0);
      setProgressText(data.text || '');
    };
    
    const removeListener = electronAPI.onTranscriptionProgress(handleProgress);
    return removeListener;
  }, []);

  // テキストをコピー
  const handleCopyText = async () => {
    if (transcriptionResult) {
      try {
        await navigator.clipboard.writeText(transcriptionResult);
        setCopyMessage('✅ テキストをクリップボードにコピーしました！');
        setTimeout(() => setCopyMessage(''), 5000);
      } catch (err) {
        console.error('コピーに失敗しました:', err);
        setCopyMessage('❌ クリップボードへのコピーに失敗しました');
        setTimeout(() => setCopyMessage(''), 5000);
      }
    }
  };


  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '40px',
        padding: '20px',
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F9FF 100%)',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px' 
        }}>
          <div style={{
            fontSize: '42px',
            textShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
          }}>
            🎙️
          </div>
          <h1 style={{ 
            margin: 0,
            fontSize: '32px',
            fontWeight: '900',
            background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            letterSpacing: '0.5px'
          }}>
            GaQ オフライン文字起こしツール
          </h1>
        </div>
        <button
          onClick={(e) => {
            console.log('モデル設定ボタンクリック - isTranscribing状態:', isTranscribing); // デバッグ追加
            onNavigateToSettings();
          }}
          disabled={isTranscribing}
          style={{
            backgroundColor: isTranscribing ? '#9CA3AF' : '#10B981',
            color: isTranscribing ? '#6B7280' : 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isTranscribing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            opacity: isTranscribing ? 0.6 : 1
          }}
          onMouseOver={(e) => {
            if (!isTranscribing) {
              e.target.style.backgroundColor = '#059669';
            }
          }}
          onMouseOut={(e) => {
            if (!isTranscribing) {
              e.target.style.backgroundColor = '#10B981';
            }
          }}
          title={isTranscribing ? '⚠️ 文字起こし処理中のため無効です' : 'モデル設定画面を開きます'}
        >
          {isTranscribing ? '⏳ 処理中' : '⚙️ モデル設定'}
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div style={{
          backgroundColor: '#FEE2E2',
          border: '1px solid #EF4444',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          color: '#991B1B'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ファイルドロップゾーン */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `4px dashed ${dragOver ? '#2563EB' : '#3B82F6'}`,
          borderRadius: '16px',
          padding: '40px 30px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: dragOver ? '#DBEAFE' : '#EFF6FF',
          background: dragOver 
            ? 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)' 
            : 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
          transition: 'all 0.3s ease',
          marginBottom: '20px',
          boxShadow: dragOver 
            ? '0 8px 24px rgba(37, 99, 235, 0.2)' 
            : '0 4px 12px rgba(37, 99, 235, 0.1)',
          transform: dragOver ? 'scale(1.02)' : 'scale(1)',
          position: 'relative',
          overflow: 'hidden'
        }}
        onMouseEnter={(e) => {
          if (!dragOver) {
            e.currentTarget.style.transform = 'scale(1.01)';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(37, 99, 235, 0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!dragOver) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.1)';
          }
        }}
      >
        <div style={{ 
          fontSize: '56px', 
          marginBottom: '16px',
          animation: dragOver ? 'pulse 1.5s ease-in-out infinite' : 'none'
        }}>
          {dragOver ? '📥' : '🎵'}
        </div>
        <p style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#1E40AF',
          margin: '0 0 8px 0',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
        }}>
          音声ファイルをドラッグ&ドロップ
        </p>
        <p style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#3B82F6',
          margin: 0
        }}>
          または クリックしてファイルを選択
        </p>
        <div style={{
          marginTop: '20px',
          padding: '8px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: '8px',
          display: 'inline-block',
          backdropFilter: 'blur(10px)'
        }}>
          <p style={{
            fontSize: '14px',
            color: '#1E40AF',
            margin: 0,
            fontWeight: '600'
          }}>
            対応形式: {AUDIO_EXTENSIONS.join(', ')}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_EXTENSIONS.map(ext => `.${ext}`).join(',')}
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* 選択されたファイル情報 */}
      {selectedFile && (
        <div style={{
          backgroundColor: '#F3F4F6',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1F2937' }}>
            選択されたファイル:
          </h3>
          <p style={{ margin: 0, color: '#4B5563' }}>{selectedFile.name}</p>
        </div>
      )}

      {/* 文字起こしボタン */}
      {!isTranscribing && (
        <button
          onClick={selectedFile ? handleTranscribe : undefined}
          disabled={!selectedFile}
          style={{
            backgroundColor: selectedFile ? '#2563EB' : '#9CA3AF',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '16px 32px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: selectedFile ? 'pointer' : 'not-allowed',
            width: '100%',
            marginBottom: '20px',
            transition: 'background-color 0.2s',
            opacity: selectedFile ? 1 : 0.6
          }}
          onMouseOver={(e) => {
            if (selectedFile) {
              e.target.style.backgroundColor = '#1D4ED8';
            }
          }}
          onMouseOut={(e) => {
            if (selectedFile) {
              e.target.style.backgroundColor = '#2563EB';
            }
          }}
        >
          🎯 文字起こしを開始
        </button>
      )}

      {/* 成功メッセージ（文字起こしボタンの直下） */}
      {successMessage && !isTranscribing && (
        <div style={{
          backgroundColor: '#D1FAE5',
          border: '2px solid #10B981',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          color: '#065F46',
          fontSize: '16px',
          fontWeight: '600',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {successMessage}
        </div>
      )}

      {/* 進捗表示 */}
      {isTranscribing && (
        <div style={{
          backgroundColor: '#F3F4F6',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <p style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: '600',
              color: '#1F2937'
            }}>
              {progressText || '処理中...'}
            </p>
            <span style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#2563EB',
              minWidth: '60px',
              textAlign: 'right'
            }}>
              {Math.round(progress || 0)}%
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '12px',
            backgroundColor: '#E5E7EB',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              width: `${progress || 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #2563EB 0%, #3B82F6 100%)',
              borderRadius: '6px',
              transition: 'width 0.3s ease',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)'
            }}></div>
          </div>
        </div>
      )}

      {/* 文字起こし結果 */}
      {transcriptionResult && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            color: '#1F2937'
          }}>
            📝 文字起こし結果:
          </h3>
          <div style={{
            backgroundColor: '#F9FAFB',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '16px',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#374151'
            }}>
              {transcriptionResult}
            </pre>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleCopyText}
              style={{
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#10B981'}
            >
              📋 テキストをコピー
            </button>
          </div>
        </div>
      )}

      {/* コピー確認メッセージ */}
      {copyMessage && (
        <div style={{
          backgroundColor: copyMessage.includes('✅') ? '#D1FAE5' : '#FEE2E2',
          border: `2px solid ${copyMessage.includes('✅') ? '#10B981' : '#EF4444'}`,
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          color: copyMessage.includes('✅') ? '#065F46' : '#991B1B',
          fontSize: '16px',
          fontWeight: '600',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          {copyMessage}
        </div>
      )}

      {/* 現在の設定表示 */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        padding: '24px',
        marginTop: '30px'
      }}>
        <h3 style={{
          margin: '0 0 20px 0',
          fontSize: '18px',
          color: '#1F2937'
        }}>
          文字起こし設定
        </h3>
        
        {/* 品質レベル表示 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151'
          }}>
            品質レベル:
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {(() => {
              const hasModel = downloadedModels.has(localSettings.modelSize);
              console.log('モデル判定:', {
                modelSize: localSettings.modelSize,
                downloadedModels: Array.from(downloadedModels),
                hasModel: hasModel
              });
              return hasModel;
            })() ? (
              <>
                <div style={{
                  flex: 1,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  padding: '12px 16px'
                }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1F2937',
                    marginBottom: '4px'
                  }}>
                    {MODEL_INFO[localSettings.modelSize]?.displayName || localSettings.modelSize.toUpperCase()} - {MODEL_INFO[localSettings.modelSize]?.subtitle || ''}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#6B7280'
                  }}>
                    {MODEL_INFO[localSettings.modelSize]?.description || ''}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  flex: 1,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #86EFAC',
                  borderRadius: '8px',
                  padding: '12px 16px'
                }}>
                  <div style={{
                    fontSize: '16px',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>✨</span>
                    <span>モデルを準備中です（モデル設定からダウンロードできます）</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* その他の設定 */}
        <div style={{
          backgroundColor: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '16px'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151'
          }}>
            詳細設定
          </h4>
          <div style={{ display: 'flex', gap: '16px' }}>
            <CheckboxButton
              checked={localSettings.speakerDetection}
              onChange={(e) => {
                console.log('=== 話者検出ボタン変更 ===');
                const newSettings = { ...localSettings, speakerDetection: e.target.checked };
                setLocalSettings(newSettings);
                electronAPI.updateSetting('speakerDetection', e.target.checked)
                  .then(result => console.log('設定保存成功:', result))
                  .catch(err => {
                    console.error('設定保存エラー:', err);
                    setLocalSettings(localSettings);
                  });
              }}
              label="話者を区別する"
            />
            
            <CheckboxButton
              checked={localSettings.playBellSound}
              onChange={(e) => {
                console.log('=== ベル音ボタン変更 ===');
                const newSettings = { ...localSettings, playBellSound: e.target.checked };
                setLocalSettings(newSettings);
                electronAPI.updateSetting('playBellSound', e.target.checked)
                  .then(result => console.log('設定保存成功:', result))
                  .catch(err => {
                    console.error('設定保存エラー:', err);
                    setLocalSettings(localSettings);
                  });
              }}
              label="完了時に音でお知らせ"
            />
          </div>
        </div>
      </div>

      {/* 制作者情報・連絡先 */}
      <div style={{
        marginTop: '40px',
        padding: '24px',
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: '2px solid #2563EB',
        borderRadius: '12px',
        textAlign: 'center',
        boxShadow: '0 6px 18px rgba(37, 99, 235, 0.15)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #2563EB 0%, #3B82F6 50%, #2563EB 100%)'
        }}></div>
        
        <div style={{
          fontSize: '16px',
          color: '#1F2937',
          lineHeight: '1.6'
        }}>
          <div style={{ 
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: 'rgba(37, 99, 235, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(37, 99, 235, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ 
                fontSize: '24px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>🏫</span>
              <span style={{ 
                fontWeight: '700', 
                color: '#1F2937',
                fontSize: '16px'
              }}>制作: </span>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                公立はこだて未来大学 辻研究室（テスト）
              </span>
            </div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}>
              <span style={{ 
                fontSize: '24px',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>✉️</span>
              <span style={{ 
                fontWeight: '700', 
                color: '#1F2937',
                fontSize: '16px'
              }}>連絡先: </span>
              <a 
                href="mailto:info@tsuji-lab.net"
                style={{
                  color: '#2563EB',
                  fontSize: '16px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  transition: 'all 0.3s ease',
                  padding: '2px 4px',
                  borderRadius: '4px'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
                  e.target.style.color = '#1D4ED8';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#2563EB';
                }}
              >
                info@tsuji-lab.net
              </a>
            </div>
          </div>
          <div>
            <button
              onClick={onShowInitialInfo}
              style={{
                backgroundColor: 'transparent',
                color: '#2563EB',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '4px 8px',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#EBF5FF'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              📋 初回起動画面を見る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// React.memoを使用して不必要な再レンダリングを防ぐ（比較関数付き）
export default React.memo(TranscriptionScreen, (prevProps, nextProps) => {
  // propsが変更されていない場合はtrueを返してre-renderをスキップ
  return (
    prevProps.onNavigateToSettings === nextProps.onNavigateToSettings &&
    prevProps.onShowInitialInfo === nextProps.onShowInitialInfo
  );
});
