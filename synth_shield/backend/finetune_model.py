"""
SynthShield — EfficientNet-B4 Fine-tuning Script
=================================================

Fine-tunes EfficientNet-B4 on a binary real/fake deepfake dataset.
Saves the best checkpoint to backend/models/efficientnet_deepfake.pth.

Dataset Download Instructions
------------------------------
# FaceForensics++ (manipulated face videos + extracted frames)
#   https://github.com/ondyari/FaceForensics
#   Request access, download c23/c40 quality, extract frames with their scripts.

# Celeb-DF (high-quality celebrity deepfake dataset)
#   https://github.com/yuezunli/celeb-deepfakeforensics
#   Download Celeb-real/, Celeb-synthesis/, YouTube-real/ folders.

# DFDC — DeepFake Detection Challenge (Meta/Facebook, largest dataset)
#   https://ai.facebook.com/datasets/dfdc/
#   Download via Kaggle: https://www.kaggle.com/c/deepfake-detection-challenge

Expected folder structure after preparing any dataset
------------------------------------------------------
dataset/
├── real/     (real images or extracted video frames)
│   ├── img_0001.jpg
│   └── ...
└── fake/     (deepfake images or extracted video frames)
    ├── img_0001.jpg
    └── ...

Usage
-----
    python finetune_model.py --dataset /path/to/dataset
    python finetune_model.py --dataset /path/to/dataset --epochs 30 --batch-size 16
    python finetune_model.py --dataset /path/to/dataset --resume models/efficientnet_deepfake.pth
"""

import argparse
import os
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms
from torchvision.models import efficientnet_b4, EfficientNet_B4_Weights

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fine-tune EfficientNet-B4 on a real/fake deepfake dataset."
    )
    p.add_argument("--dataset",    required=True, help="Path to dataset/ folder (must contain real/ and fake/)")
    p.add_argument("--epochs",     type=int, default=20,   help="Maximum training epochs (default: 20)")
    p.add_argument("--batch-size", type=int, default=16,   help="Batch size (default: 16)")
    p.add_argument("--lr",         type=float, default=1e-4, help="Learning rate (default: 1e-4)")
    p.add_argument("--val-split",  type=float, default=0.15, help="Validation fraction (default: 0.15)")
    p.add_argument("--patience",   type=int, default=5,    help="Early stopping patience (default: 5)")
    p.add_argument("--output",     default="models/efficientnet_deepfake.pth",
                   help="Output model path (default: models/efficientnet_deepfake.pth)")
    p.add_argument("--resume",     default=None, help="Resume from a previous checkpoint")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# Data
# ─────────────────────────────────────────────────────────────────────────────

def build_transforms(train: bool) -> transforms.Compose:
    if train:
        return transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])
    else:
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])


def load_datasets(dataset_root: str, val_fraction: float):
    """
    Loads a flat ImageFolder where class names 'real' and 'fake' map to 0 and 1.
    Applies train augmentation to the training split.
    """
    root = Path(dataset_root)
    for cls in ("real", "fake"):
        if not (root / cls).exists():
            raise FileNotFoundError(
                f"Expected '{cls}/' folder inside {dataset_root}. "
                "See dataset preparation instructions at the top of this script."
            )

    full_ds = datasets.ImageFolder(root=str(root), transform=None)
    print(f"Dataset: {len(full_ds)} images — classes: {full_ds.class_to_idx}")

    val_size   = int(len(full_ds) * val_fraction)
    train_size = len(full_ds) - val_size
    train_base, val_base = random_split(
        full_ds, [train_size, val_size],
        generator=torch.Generator().manual_seed(42),
    )

    class _WrapDataset(torch.utils.data.Dataset):
        """Applies a transform to a Subset without modifying the original dataset."""
        def __init__(self, subset, transform):
            self.subset    = subset
            self.transform = transform

        def __len__(self):
            return len(self.subset)

        def __getitem__(self, idx):
            img, label = self.subset[idx]
            if self.transform and not isinstance(img, torch.Tensor):
                img = self.transform(img)
            elif self.transform:
                img = self.transform(transforms.ToPILImage()(img))
            return img, label

    # Load images as PIL (no transform on the base dataset)
    full_ds.transform = transforms.Lambda(lambda x: x)   # identity — return PIL

    train_ds = _WrapDataset(train_base, build_transforms(train=True))
    val_ds   = _WrapDataset(val_base,   build_transforms(train=False))

    return train_ds, val_ds


# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

def build_model(resume: str | None = None) -> nn.Module:
    model = efficientnet_b4(weights=EfficientNet_B4_Weights.IMAGENET1K_V1)
    in_features = model.classifier[1].in_features  # 1792

    model.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.3),
        nn.Linear(512, 1),
        nn.Sigmoid(),
    )

    if resume and Path(resume).exists():
        state = torch.load(resume, map_location="cpu")
        model.load_state_dict(state)
        print(f"Resumed from checkpoint: {resume}")

    # Freeze all layers except the last 2 EfficientNet blocks + classifier head
    # EfficientNet-B4 features: features[0..8], then avgpool + classifier
    for name, param in model.named_parameters():
        param.requires_grad = False

    # Unfreeze: features[7], features[8], avgpool, classifier
    unfreeze_prefixes = ("features.7", "features.8", "avgpool", "classifier")
    for name, param in model.named_parameters():
        if any(name.startswith(p) for p in unfreeze_prefixes):
            param.requires_grad = True

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total     = sum(p.numel() for p in model.parameters())
    print(f"Trainable parameters: {trainable:,} / {total:,}")

    return model


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def run_epoch(model, loader, criterion, optimizer, device, train: bool):
    model.train(train)
    total_loss = correct = total = 0

    with torch.set_grad_enabled(train):
        for images, labels in loader:
            images = images.to(device)
            labels = labels.float().unsqueeze(1).to(device)

            preds = model(images)
            loss  = criterion(preds, labels)

            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * images.size(0)
            correct    += ((preds >= 0.5).float() == labels).sum().item()
            total      += images.size(0)

    avg_loss = total_loss / total
    accuracy = correct / total
    return avg_loss, accuracy


def train(args: argparse.Namespace) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Data
    train_ds, val_ds = load_datasets(args.dataset, args.val_split)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=0, pin_memory=(device.type == "cuda"))
    val_loader   = DataLoader(val_ds,   batch_size=args.batch_size, shuffle=False,
                              num_workers=0, pin_memory=(device.type == "cuda"))
    print(f"Train: {len(train_ds)} | Val: {len(val_ds)}")

    # Model
    model     = build_model(args.resume).to(device)
    criterion = nn.BCELoss()
    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr,
        weight_decay=1e-4,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    # Output dir
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Training loop with early stopping
    best_val_loss = float("inf")
    patience_ctr  = 0

    print(f"\n{'Epoch':>6}  {'Train Loss':>10}  {'Val Loss':>8}  {'Val Acc':>8}  {'LR':>8}")
    print("-" * 55)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()

        tr_loss, _        = run_epoch(model, train_loader, criterion, optimizer, device, train=True)
        val_loss, val_acc = run_epoch(model, val_loader,   criterion, optimizer, device, train=False)

        scheduler.step()
        lr = scheduler.get_last_lr()[0]
        elapsed = time.time() - t0

        print(f"{epoch:>6}  {tr_loss:>10.4f}  {val_loss:>8.4f}  {val_acc:>7.2%}  {lr:>8.2e}  ({elapsed:.0f}s)")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_ctr  = 0
            torch.save(model.state_dict(), str(out_path))
            print(f"         ✓ Best model saved → {out_path}")
        else:
            patience_ctr += 1
            if patience_ctr >= args.patience:
                print(f"\nEarly stopping triggered after {epoch} epochs (patience={args.patience}).")
                break

    print(f"\nTraining complete. Best val loss: {best_val_loss:.4f}")
    print(f"Model saved to: {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = parse_args()
    train(args)
