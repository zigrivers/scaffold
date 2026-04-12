export const ML_FRAMEWORK_DEPS = [
  'torch', 'pytorch-lightning', 'tensorflow', 'keras', 'jax',
  'scikit-learn', 'xgboost', 'lightgbm', 'catboost',
  'transformers', 'sentence-transformers', 'mlx',
] as const

export const EXPERIMENT_TRACKING_DEPS = [
  'mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc',
] as const
